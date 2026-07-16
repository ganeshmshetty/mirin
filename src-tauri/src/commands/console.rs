use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;
use tauri::{AppHandle, Emitter, State};
use tokio::io::{AsyncBufReadExt, BufReader};
use std::process::Stdio;
use crate::adb::Adb;
use crate::utils;
use serde::Serialize;

pub struct LogcatState(pub Arc<Mutex<HashMap<String, tokio::task::JoinHandle<()>>>>);

impl LogcatState {
    pub fn new() -> Self {
        Self(Arc::new(Mutex::new(HashMap::new())))
    }
}

#[derive(Clone, Serialize)]
pub struct LogcatPayload {
    pub device_id: String,
    pub line: String,
}

#[tauri::command]
pub async fn start_logcat(
    app: AppHandle,
    state: State<'_, LogcatState>,
    device_id: String,
) -> Result<(), String> {
    let mut map = state.0.lock().await;
    
    if map.contains_key(&device_id) {
        return Ok(());
    }
    
    let adb_path = utils::get_adb_path(&app)?;
    let app_clone = app.clone();
    let device_id_clone = device_id.clone();
    
    let handle = tokio::spawn(async move {
        // Clear logcat first
        let mut clear_cmd = tokio::process::Command::new(&adb_path);
        clear_cmd.arg("-s").arg(&device_id_clone).arg("logcat").arg("-c");
        let _ = clear_cmd.output().await;

        let mut cmd = tokio::process::Command::new(adb_path);
        cmd.arg("-s").arg(&device_id_clone).arg("logcat");
        
        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            cmd.creation_flags(0x08000000);
        }
        
        cmd.stdout(Stdio::piped());
        cmd.stderr(Stdio::piped());
        
        if let Ok(mut child) = cmd.spawn() {
            if let Some(stdout) = child.stdout.take() {
                let mut reader = BufReader::new(stdout).lines();
                while let Ok(Some(line)) = reader.next_line().await {
                    let _ = app_clone.emit("logcat", LogcatPayload {
                        device_id: device_id_clone.clone(),
                        line,
                    });
                }
            }
        }
    });
    
    map.insert(device_id, handle);
    Ok(())
}

#[tauri::command]
pub async fn stop_logcat(
    state: State<'_, LogcatState>,
    device_id: String,
) -> Result<(), String> {
    let mut map = state.0.lock().await;
    if let Some(handle) = map.remove(&device_id) {
        handle.abort();
    }
    Ok(())
}

#[tauri::command]
pub async fn execute_shell_command(
    app: AppHandle,
    device_id: String,
    command: String,
) -> Result<String, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    
    // Passing the entire command as a single argument allows adbd to parse it as a shell string, preserving quotes.
    adb.execute(&["shell", &command]).await
}
