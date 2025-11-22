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

/// Build the scrcpy command without executing it
pub fn build_scrcpy_command(
    scrcpy_path: &std::path::Path,
    scrcpy_dir: &std::path::Path,
    adb_dir: Option<&std::path::Path>,
    device_id: Option<&str>,
    options: &ScrcpyOptions,
) -> Command {
    let mut cmd = Command::new(scrcpy_path);
    
    // Set working directory to scrcpy directory (for DLL dependencies)
    cmd.current_dir(scrcpy_dir);
    
    // Set ADB path environment variable
    if let Some(dir) = adb_dir {
        let path_env = std::env::var("PATH").unwrap_or_default();
        let new_path = format!("{};{}", dir.to_string_lossy(), path_env);
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
        cmd.arg("--video-bit-rate").arg(bit_rate.to_string());
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
    
    cmd
}

/// Execute scrcpy with the given device ID and options
pub fn execute_scrcpy(
    app: &tauri::AppHandle,
    device_id: Option<&str>,
    options: &ScrcpyOptions,
) -> Result<Child, String> {
    let scrcpy_path = utils::get_scrcpy_path(app)?;
    let scrcpy_dir = utils::get_scrcpy_dir(app)?;
    let adb_dir = utils::get_adb_dir(app).ok();
    
    let mut cmd = build_scrcpy_command(
        &scrcpy_path,
        &scrcpy_dir,
        adb_dir.as_deref(),
        device_id,
        options
    );
    
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
    use std::path::PathBuf;

    #[test]
    fn test_default_options() {
        let options = ScrcpyOptions::default();
        assert_eq!(options.max_size, Some(1920));
        assert_eq!(options.bit_rate, Some(8000000));
        assert_eq!(options.max_fps, Some(60));
        assert_eq!(options.stay_awake, true);
    }

    #[test]
    fn test_command_generation_resolution() {
        let options = ScrcpyOptions {
            max_size: Some(1080),
            ..Default::default()
        };
        
        let cmd = build_scrcpy_command(
            &PathBuf::from("scrcpy"),
            &PathBuf::from("."),
            None,
            None,
            &options
        );
        
        let args: Vec<&str> = cmd.get_args().map(|s| s.to_str().unwrap()).collect();
        assert!(args.contains(&"--max-size"));
        assert!(args.contains(&"1080"));
    }

    #[test]
    fn test_command_generation_bitrate() {
        let options = ScrcpyOptions {
            bit_rate: Some(4000000),
            ..Default::default()
        };
        
        let cmd = build_scrcpy_command(
            &PathBuf::from("scrcpy"),
            &PathBuf::from("."),
            None,
            None,
            &options
        );
        
        let args: Vec<&str> = cmd.get_args().map(|s| s.to_str().unwrap()).collect();
        assert!(args.contains(&"--video-bit-rate"));
        assert!(args.contains(&"4000000"));
    }

    #[test]
    fn test_command_generation_fps() {
        let options = ScrcpyOptions {
            max_fps: Some(30),
            ..Default::default()
        };
        
        let cmd = build_scrcpy_command(
            &PathBuf::from("scrcpy"),
            &PathBuf::from("."),
            None,
            None,
            &options
        );
        
        let args: Vec<&str> = cmd.get_args().map(|s| s.to_str().unwrap()).collect();
        assert!(args.contains(&"--max-fps"));
        assert!(args.contains(&"30"));
    }

    #[test]
    fn test_command_generation_flags() {
        let options = ScrcpyOptions {
            always_on_top: true,
            stay_awake: true,
            turn_screen_off: true,
            ..Default::default()
        };
        
        let cmd = build_scrcpy_command(
            &PathBuf::from("scrcpy"),
            &PathBuf::from("."),
            None,
            None,
            &options
        );
        
        let args: Vec<&str> = cmd.get_args().map(|s| s.to_str().unwrap()).collect();
        assert!(args.contains(&"--always-on-top"));
        assert!(args.contains(&"--stay-awake"));
        assert!(args.contains(&"--turn-screen-off"));
    }

    #[test]
    fn test_command_generation_device_id() {
        let options = ScrcpyOptions::default();
        
        let cmd = build_scrcpy_command(
            &PathBuf::from("scrcpy"),
            &PathBuf::from("."),
            None,
            Some("device123"),
            &options
        );
        
        let args: Vec<&str> = cmd.get_args().map(|s| s.to_str().unwrap()).collect();
        assert!(args.contains(&"-s"));
        assert!(args.contains(&"device123"));
    }

    #[test]
    fn test_scrcpy_state_management() {
        let state = ScrcpyState::new();
        
        // Initially empty
        assert_eq!(state.active_count(), 0);
        assert_eq!(state.get_active_sessions().unwrap().len(), 0);
        
        // We can't easily create a real Child process in tests without spawning something,
        // but we can verify the state container logic if we could construct a ProcessInfo.
        // However, ProcessInfo requires a Child which has no public constructor.
        // So we'll just test the empty state behavior here.
        
        assert!(!state.is_running("session1"));
        assert!(state.get_process_info("session1").unwrap().is_none());
    }

    #[test]
    fn test_state_concurrency() {
        let state = Arc::new(ScrcpyState::new());
        let mut handles = vec![];

        // Spawn 10 threads that check state concurrently
        for _ in 0..10 {
            let state_clone = state.clone();
            handles.push(std::thread::spawn(move || {
                for _ in 0..100 {
                    let _ = state_clone.active_count();
                    let _ = state_clone.get_active_sessions();
                }
            }));
        }

        for handle in handles {
            handle.join().unwrap();
        }
        
        // Should still be consistent
        assert_eq!(state.active_count(), 0);
    }
}
