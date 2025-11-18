use std::process::{Command, Child, Stdio};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use serde::{Serialize, Deserialize};
use crate::utils;

/// Global state to track active scrcpy processes
#[derive(Clone)]
pub struct ScrcpyState {
    pub processes: Arc<Mutex<HashMap<String, ProcessInfo>>>,
}

#[derive(Debug)]
pub struct ProcessInfo {
    pub child: Child,
    pub device_id: String,
    pub started_at: std::time::SystemTime,
}

impl ScrcpyState {
    pub fn new() -> Self {
        Self {
            processes: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Add a process to tracking
    pub fn add_process(&self, session_id: String, process_info: ProcessInfo) -> Result<(), String> {
        let mut processes = self.processes.lock()
            .map_err(|e| format!("Failed to lock processes: {}", e))?;
        processes.insert(session_id, process_info);
        Ok(())
    }

    /// Remove and return a process
    pub fn remove_process(&self, session_id: &str) -> Result<Option<ProcessInfo>, String> {
        let mut processes = self.processes.lock()
            .map_err(|e| format!("Failed to lock processes: {}", e))?;
        Ok(processes.remove(session_id))
    }

    /// Check if a session is running
    pub fn is_running(&self, session_id: &str) -> bool {
        if let Ok(processes) = self.processes.lock() {
            processes.contains_key(session_id)
        } else {
            false
        }
    }

    /// Get all active session IDs
    pub fn get_active_sessions(&self) -> Result<Vec<String>, String> {
        let processes = self.processes.lock()
            .map_err(|e| format!("Failed to lock processes: {}", e))?;
        Ok(processes.keys().cloned().collect())
    }

    /// Get process info for a session (for monitoring)
    pub fn get_process_info(&self, session_id: &str) -> Result<Option<(String, std::time::SystemTime)>, String> {
        let processes = self.processes.lock()
            .map_err(|e| format!("Failed to lock processes: {}", e))?;
        
        Ok(processes.get(session_id).map(|info| (info.device_id.clone(), info.started_at)))
    }

    /// Clean up finished processes
    pub fn cleanup_finished(&self) -> Result<(), String> {
        let mut processes = self.processes.lock()
            .map_err(|e| format!("Failed to lock processes: {}", e))?;
        
        processes.retain(|_, info| {
            // Check if process is still running
            match info.child.try_wait() {
                Ok(Some(_)) => false, // Process finished, remove it
                Ok(None) => true,     // Still running, keep it
                Err(_) => false,      // Error checking, assume dead
            }
        });
        
        Ok(())
    }

    /// Stop all processes (for cleanup on app exit)
    pub fn stop_all(&self) -> Result<(), String> {
        let mut processes = self.processes.lock()
            .map_err(|e| format!("Failed to lock processes: {}", e))?;
        
        println!("Stopping {} scrcpy process(es)...", processes.len());
        
        for (session_id, mut info) in processes.drain() {
            match info.child.kill() {
                Ok(_) => println!("Stopped session: {}", session_id),
                Err(e) => eprintln!("Failed to stop session {}: {}", session_id, e),
            }
        }
        
        Ok(())
    }

    /// Get count of active processes
    pub fn active_count(&self) -> usize {
        self.processes.lock().map(|p| p.len()).unwrap_or(0)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScrcpyOptions {
    pub max_size: Option<u32>,
    pub bit_rate: Option<u32>,
    pub max_fps: Option<u32>,
    pub always_on_top: bool,
    pub stay_awake: bool,
    pub turn_screen_off: bool,
}

impl Default for ScrcpyOptions {
    fn default() -> Self {
        Self {
            max_size: Some(1920),
            bit_rate: Some(8000000), // 8Mbps
            max_fps: Some(60),
            always_on_top: false,
            stay_awake: true,
            turn_screen_off: false,
        }
    }
}

/// Execute scrcpy with the given device ID and options
pub fn execute_scrcpy(
    app: &tauri::AppHandle,
    device_id: Option<&str>,
    options: &ScrcpyOptions,
) -> Result<Child, String> {
    let scrcpy_path = utils::get_scrcpy_path(app)?;
    let scrcpy_dir = utils::get_scrcpy_dir(app)?;
    
    let mut cmd = Command::new(scrcpy_path);
    
    // Set working directory to scrcpy directory (for DLL dependencies)
    cmd.current_dir(scrcpy_dir);
    
    // Set ADB path environment variable
    if let Ok(adb_dir) = utils::get_adb_dir(app) {
        let path_env = std::env::var("PATH").unwrap_or_default();
        let new_path = format!("{};{}", adb_dir.to_string_lossy(), path_env);
        cmd.env("PATH", new_path);
    }
    
    // Add device ID if specified
    if let Some(id) = device_id {
        cmd.arg("-s").arg(id);
    }
    
    // Add options
    if let Some(max_size) = options.max_size {
        cmd.arg("--max-size").arg(max_size.to_string());
    }
    
    if let Some(bit_rate) = options.bit_rate {
        cmd.arg("--bit-rate").arg(bit_rate.to_string());
    }
    
    if let Some(max_fps) = options.max_fps {
        cmd.arg("--max-fps").arg(max_fps.to_string());
    }
    
    if options.always_on_top {
        cmd.arg("--always-on-top");
    }
    
    if options.stay_awake {
        cmd.arg("--stay-awake");
    }
    
    if options.turn_screen_off {
        cmd.arg("--turn-screen-off");
    }
    
    // Spawn the process
    cmd.stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to start scrcpy: {}", e))
}

/// Kill a scrcpy process
pub fn kill_process(mut child: Child) -> Result<(), String> {
    child.kill()
        .map_err(|e| format!("Failed to kill process: {}", e))
}

/// Get scrcpy version
pub fn get_version(app: &tauri::AppHandle) -> Result<String, String> {
    let scrcpy_path = utils::get_scrcpy_path(app)?;
    let scrcpy_dir = utils::get_scrcpy_dir(app)?;
    
    let output = Command::new(scrcpy_path)
        .current_dir(scrcpy_dir)
        .arg("--version")
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

/// Check if scrcpy is available
pub fn check_available(app: &tauri::AppHandle) -> bool {
    utils::get_scrcpy_path(app).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_options() {
        let options = ScrcpyOptions::default();
        assert_eq!(options.max_size, Some(1920));
        assert_eq!(options.bit_rate, Some(8000000));
        assert_eq!(options.max_fps, Some(60));
        assert_eq!(options.stay_awake, true);
    }
}
