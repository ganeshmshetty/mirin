pub mod control;
pub mod stream;
pub mod video;

use std::process::Command;
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use crate::utils;
use tokio::sync::{Mutex as TokioMutex, Notify};
use tokio::net::TcpStream;

pub struct EmbeddedSessionInfo {
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
    connect_locks: Arc<TokioMutex<HashMap<String, Arc<TokioMutex<()>>>>>,
}

impl EmbeddedScrcpyState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(Mutex::new(HashMap::new())),
            connect_locks: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }

    pub async fn lock_device_connect(&self, serial: &str) -> Arc<TokioMutex<()>> {
        let mut locks = self.connect_locks.lock().await;
        locks
            .entry(serial.to_string())
            .or_insert_with(|| Arc::new(TokioMutex::new(())))
            .clone()
    }

    pub fn add_session(&self, serial: String, session: EmbeddedSessionInfo) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        if let Some(mut old) = sessions.insert(serial, session) {
            // Should be rare (caller usually remove_session first), but never orphan.
            old.shutdown_notify.notify_one();
            let _ = old.server_process.start_kill();
        }
        Ok(())
    }

    pub fn remove_session(&self, serial: &str) -> Result<Option<EmbeddedSessionInfo>, String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        Ok(sessions.remove(serial))
    }

    pub fn get_control_socket(&self, serial: &str) -> Result<Arc<TokioMutex<TcpStream>>, String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.get(serial)
            .map(|s| s.control_socket.clone())
            .ok_or_else(|| format!("No embedded session found for device {}", serial))
    }

    pub fn get_session_info(&self, serial: &str) -> Result<(Arc<TokioMutex<TcpStream>>, u32, u32), String> {
        let sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        sessions.get(serial)
            .map(|s| (s.control_socket.clone(), s.screen_width, s.screen_height))
            .ok_or_else(|| format!("No embedded session found for device {}", serial))
    }

    pub fn stop_all(&self) -> Result<(), String> {
        let mut sessions = self.sessions.lock().map_err(|e| e.to_string())?;
        for (_serial, mut session) in sessions.drain() {
            session.shutdown_notify.notify_one();
            let _ = session.server_process.start_kill();
        }
        Ok(())
    }
}

/// Get scrcpy version
pub fn get_version(app: &tauri::AppHandle) -> Result<String, String> {
    let scrcpy_path = utils::get_scrcpy_path(app)?;
    let scrcpy_dir = utils::get_scrcpy_dir(app)?;

    #[cfg(target_os = "windows")]
    use std::os::windows::process::CommandExt;
    
    let mut cmd = Command::new(scrcpy_path);
    cmd.current_dir(scrcpy_dir)
       .arg("--version");

    #[cfg(target_os = "windows")]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let output = cmd.output()
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
pub fn get_version_number(app: &tauri::AppHandle) -> String {
    if let Ok(version_output) = get_version(app) {
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
pub fn check_available(app: &tauri::AppHandle) -> bool {
    utils::get_scrcpy_path(app).is_ok()
}
