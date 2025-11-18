mod commands;
mod utils;
mod scrcpy;
mod adb;

use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

// Resource path commands
#[tauri::command]
fn get_adb_path(app: tauri::AppHandle) -> Result<String, String> {
    utils::get_adb_path(&app).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn get_scrcpy_path(app: tauri::AppHandle) -> Result<String, String> {
    utils::get_scrcpy_path(&app).map(|p| p.to_string_lossy().to_string())
}

#[tauri::command]
fn verify_bundled_resources(app: tauri::AppHandle) -> Result<bool, String> {
    // Verify both ADB and scrcpy are available
    utils::get_adb_path(&app)?;
    utils::get_scrcpy_path(&app)?;
    Ok(true)
}

#[tauri::command]
fn test_scrcpy_execution(app: tauri::AppHandle) -> Result<String, String> {
    // Test scrcpy by getting its version
    scrcpy::get_version(&app)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize scrcpy state
    let scrcpy_state = scrcpy::ScrcpyState::new();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(scrcpy_state)
        .invoke_handler(tauri::generate_handler![
            greet,
            get_adb_path,
            get_scrcpy_path,
            verify_bundled_resources,
            test_scrcpy_execution,
            // Device commands
            commands::get_connected_devices,
            commands::connect_wireless_device,
            commands::disconnect_device,
            commands::enable_wireless_mode,
            commands::refresh_devices,
            // Scrcpy commands
            commands::start_mirroring,
            commands::stop_mirroring,
            commands::stop_all_mirroring,
            commands::get_mirroring_status,
            commands::get_active_sessions,
            commands::get_process_stats,
            commands::check_scrcpy_available,
            commands::get_scrcpy_version,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Clean up all scrcpy processes when window is closed
                if let Some(state) = window.try_state::<scrcpy::ScrcpyState>() {
                    println!("Window destroyed, cleaning up scrcpy processes...");
                    let _ = state.stop_all();
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
