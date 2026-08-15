pub mod control;
pub mod stream;
pub mod video;

use std::collections::HashMap;
use std::process::Command;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
use tokio::net::TcpStream;
use tokio::sync::{Mutex as TokioMutex, Notify};

pub struct EmbeddedSessionInfo {
    pub session_id: u64,
    pub control_socket: Arc<TokioMutex<TcpStream>>,
    pub shutdown_notify: Arc<Notify>,
    pub screen_width: u32,
    pub screen_height: u32,
    pub port: u16,
    pub server_process: tokio::process::Child,
}

#[derive(Clone)]
pub struct EmbeddedScrcpyState {
    pub sessions: Arc<Mutex<HashMap<String, EmbeddedSessionInfo>>>,
    /// Serialize connect/disconnect handshakes per device so overlapping
    /// frontend retries cannot thrash scrcpy-server (Device/Terminated loop).
    connect_locks: Arc<Mutex<HashMap<String, Arc<TokioMutex<()>>>>>,
    next_session_id: Arc<AtomicU64>,
}

impl EmbeddedScrcpyState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            connect_locks: Arc::new(Mutex::new(HashMap::new())),
            next_session_id: Arc::new(AtomicU64::new(1)),
        }
    }

    /// Allocate a unique monotonic session ID
    pub fn next_session_id(&self) -> u64 {
        self.next_session_id.fetch_add(1, Ordering::Relaxed)
    }

    /// Retrieve or create the per-device connect lock (async-friendly).
    pub async fn lock_device_connect(&self, serial: &str) -> Arc<TokioMutex<()>> {
        self.get_device_lock(serial)
    }

    /// Retrieve or create the per-device connect lock synchronously.
    pub fn get_device_lock(&self, serial: &str) -> Arc<TokioMutex<()>> {
        let mut locks = self.connect_locks.lock().unwrap_or_else(|e| e.into_inner());
        locks
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(TokioMutex::new(())))
            .clone()
    }

    pub fn add_session(&self, serial: String, session: EmbeddedSessionInfo) -> Result<(), String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(mut old) = sessions.insert(serial, session) {
            // Should be rare (caller usually remove_session / stop first), but never orphan.
            old.shutdown_notify.notify_waiters();
            let _ = old.server_process.start_kill();
        }
        Ok(())
    }

    pub fn remove_session(&self, serial: &str) -> Result<Option<EmbeddedSessionInfo>, String> {
        let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        Ok(sessions.remove(serial))
    }

    pub fn is_session_active(&self, serial: &str) -> bool {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.contains_key(serial)
    }

    pub fn get_active_serials(&self) -> Vec<String> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions.keys().cloned().collect()
    }

    pub fn get_control_socket(&self, serial: &str) -> Result<Arc<TokioMutex<TcpStream>>, String> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions
            .get(serial)
            .map(|s| s.control_socket.clone())
            .ok_or_else(|| format!("No embedded session found for device {}", serial))
    }

    pub fn get_session_info(
        &self,
        serial: &str,
    ) -> Result<(Arc<TokioMutex<TcpStream>>, u32, u32), String> {
        let sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
        sessions
            .get(serial)
            .map(|s| (s.control_socket.clone(), s.screen_width, s.screen_height))
            .ok_or_else(|| format!("No embedded session found for device {}", serial))
    }

    /// Fully stops and cleans up a specific device session (killing child process,
    /// removing reverse tunnel, and killing on-device scrcpy server process).
    pub async fn stop(&self, adb: &crate::adb::Adb, serial: &str) -> Result<bool, String> {
        let session = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.remove(serial)
        };

        if let Some(mut session) = session {
            session.shutdown_notify.notify_waiters();
            let _ = session.server_process.start_kill();
            stream::stop_server(adb, serial, session.port).await;
            Ok(true)
        } else {
            // Even if session wasn't tracked locally, clean up any on-device stale processes/tunnels
            stream::stop_server(adb, serial, 0).await;
            Ok(false)
        }
    }

    /// Safely stop the session ONLY if the active session matches `session_id`.
    /// This prevents an older session forwarding task from stopping a newer session that replaced it.
    pub async fn stop_if_match(
        &self,
        adb: &crate::adb::Adb,
        serial: &str,
        session_id: u64,
    ) -> Result<bool, String> {
        let session = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            if let Some(current) = sessions.get(serial) {
                if current.session_id == session_id {
                    sessions.remove(serial)
                } else {
                    None
                }
            } else {
                None
            }
        };

        if let Some(mut session) = session {
            session.shutdown_notify.notify_waiters();
            let _ = session.server_process.start_kill();
            stream::stop_server(adb, serial, session.port).await;
            Ok(true)
        } else {
            Ok(false)
        }
    }

    /// Alias for `stop`
    pub async fn stop_session(&self, adb: &crate::adb::Adb, serial: &str) -> Result<bool, String> {
        self.stop(adb, serial).await
    }

    /// Stops all sessions asynchronously with full ADB reverse and process cleanup.
    pub async fn stop_all_async(&self, adb: &crate::adb::Adb) -> Result<(), String> {
        let sessions = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.drain().collect::<Vec<_>>()
        };

        for (serial, mut session) in sessions {
            session.shutdown_notify.notify_waiters();
            let _ = session.server_process.start_kill();
            stream::stop_server(adb, &serial, session.port).await;
        }
        Ok(())
    }

    /// Synchronously stops all sessions (notifies shutdown channels and kills local child processes).
    pub fn stop_all(&self) -> Result<(), String> {
        let sessions = {
            let mut sessions = self.sessions.lock().unwrap_or_else(|e| e.into_inner());
            sessions.drain().collect::<Vec<_>>()
        };

        for (_serial, mut session) in sessions {
            session.shutdown_notify.notify_waiters();
            let _ = session.server_process.start_kill();
        }
        Ok(())
    }
}

/// Get scrcpy version
pub fn get_version(
    scrcpy_path: &std::path::Path,
    scrcpy_dir: &std::path::Path,
) -> Result<String, String> {
    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;

    let mut cmd = Command::new(scrcpy_path);
    cmd.current_dir(scrcpy_dir).arg("--version");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd
        .output()
        .map_err(|e| format!("Failed to execute scrcpy: {}", e))?;

    if output.status.success() {
        let version = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(version.trim().to_string())
    } else {
        let error = String::from_utf8_lossy(&output.stderr).to_string();
        Err(format!("Scrcpy error: {}", error))
    }
}

/// Get just the version number (e.g., "3.3.4") from the scrcpy version output
pub fn get_version_number(scrcpy_path: &std::path::Path, scrcpy_dir: &std::path::Path) -> String {
    if let Ok(version_output) = get_version(scrcpy_path, scrcpy_dir) {
        if let Some(first_line) = version_output.lines().next() {
            let parts: Vec<&str> = first_line.split_whitespace().collect();
            if parts.len() >= 2 && parts[0] == "scrcpy" {
                return parts[1].to_string();
            }
        }
    }
    "3.3.4".to_string()
}

/// Check if scrcpy is available
pub fn check_available(scrcpy_path: &std::path::Path) -> bool {
    scrcpy_path.exists()
}
