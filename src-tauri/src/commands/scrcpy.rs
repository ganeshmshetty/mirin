use serde::{Deserialize, Serialize};
use tauri::State;
use crate::scrcpy::{self, ScrcpyOptions, ScrcpyState, ProcessInfo};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MirrorSession {
    pub session_id: String,
    pub device_id: String,
    pub status: SessionStatus,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SessionStatus {
    Running,
    Stopped,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessStats {
    pub active_sessions: usize,
    pub total_started: usize,
}

/// Start screen mirroring for a device
#[tauri::command]
pub async fn start_mirroring(
    app: tauri::AppHandle,
    state: State<'_, ScrcpyState>,
    device_id: String,
    options: Option<ScrcpyOptions>,
) -> Result<String, String> {
    let opts = options.unwrap_or_default();
    
    // Clean up any finished processes first
    state.cleanup_finished()?;
    
    // Execute scrcpy
    let child = scrcpy::execute_scrcpy(
        &app,
        Some(&device_id),
        &opts,
    )?;
    
    let session_id = format!("session_{}_{}", device_id, child.id());
    
    // Store the process
    let process_info = ProcessInfo {
        child,
        device_id: device_id.clone(),
        started_at: std::time::SystemTime::now(),
    };
    
    state.add_process(session_id.clone(), process_info)?;
    
    println!("Started mirroring session: {} for device: {}", session_id, device_id);
    
    Ok(session_id)
}

/// Stop screen mirroring for a device
#[tauri::command]
pub async fn stop_mirroring(
    state: State<'_, ScrcpyState>,
    session_id: String,
) -> Result<bool, String> {
    // We need to own the ProcessInfo to kill it, so we must remove it from the map first.
    let process_info = {
        let mut processes = state.processes.lock().map_err(|e| format!("Failed to lock processes mutex: {}", e))?;
        processes.remove(&session_id)
    };

    if let Some(mut info) = process_info {
        println!("Stopping mirroring session: {}", session_id);
        match info.child.kill() {
            Ok(_) => {
                println!("Successfully stopped session: {}", session_id);
                Ok(true)
            }
            Err(e) => {
                // If killing fails, check if the process is already dead.
                // An `InvalidInput` error means the process has already exited.
                if e.kind() == std::io::ErrorKind::InvalidInput {
                    println!("Session {} was already stopped.", session_id);
                    Ok(true) // Consider it a success
                } else {
                    // For any other error, the kill command failed unexpectedly.
                    // The process might still be running. We must put the info back to avoid orphaning it.
                    eprintln!("Failed to kill process for session {}, re-inserting into map. Error: {}", session_id, e);
                    
                    // Re-acquire lock to put it back
                    let mut processes = state.processes.lock().map_err(|e_lock| format!("Failed to re-lock processes mutex: {}", e_lock))?;
                    processes.insert(session_id.clone(), info);
                    
                    Err(format!("Failed to stop session {}: {}", session_id, e))
                }
            }
        }
    } else {
        // If the session is not in the map, it might have already finished.
        // Run cleanup to be sure and then give a clearer message.
        state.cleanup_finished()?;
        Err(format!("Session not found or already terminated: {}", session_id))
    }
}

/// Stop all active mirroring sessions
#[tauri::command]
pub async fn stop_all_mirroring(
    state: State<'_, ScrcpyState>,
) -> Result<usize, String> {
    let count = state.active_count();
    state.stop_all()?;
    println!("Stopped all {} mirroring session(s)", count);
    Ok(count)
}

/// Get mirroring status for a specific session
#[tauri::command]
pub async fn get_mirroring_status(
    state: State<'_, ScrcpyState>,
    session_id: String,
) -> Result<SessionStatus, String> {
    state.cleanup_finished()?;
    
    if state.is_running(&session_id) {
        Ok(SessionStatus::Running)
    } else {
        Ok(SessionStatus::Stopped)
    }
}

/// Get all active mirroring sessions
#[tauri::command]
pub async fn get_active_sessions(
    state: State<'_, ScrcpyState>,
) -> Result<Vec<MirrorSession>, String> {
    state.cleanup_finished()?;
    
    let session_ids = state.get_active_sessions()?;
    
    let sessions: Vec<MirrorSession> = session_ids.into_iter().filter_map(|id| {
        // Get process info
        if let Ok(Some((device_id, started_at))) = state.get_process_info(&id) {
            Some(MirrorSession {
                session_id: id,
                device_id,
                status: SessionStatus::Running,
                started_at: format!("{:?}", started_at),
            })
        } else {
            None
        }
    }).collect();
    
    Ok(sessions)
}

/// Get process statistics
#[tauri::command]
pub async fn get_process_stats(
    state: State<'_, ScrcpyState>,
) -> Result<ProcessStats, String> {
    state.cleanup_finished()?;
    
    let active_sessions = state.active_count();
    
    Ok(ProcessStats {
        active_sessions,
        total_started: active_sessions, // Could track this separately if needed
    })
}

/// Check if scrcpy is installed/available
#[tauri::command]
pub async fn check_scrcpy_available(app: tauri::AppHandle) -> Result<bool, String> {
    Ok(scrcpy::check_available(&app))
}

/// Get scrcpy version
#[tauri::command]
pub async fn get_scrcpy_version(app: tauri::AppHandle) -> Result<String, String> {
    scrcpy::get_version(&app)
}
