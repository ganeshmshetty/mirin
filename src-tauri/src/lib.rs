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

#[tauri::command]
async fn open_connect_window(app: tauri::AppHandle) -> Result<(), String> {
    use tauri::Manager;

    if let Some(window) = app.get_webview_window("connect_device") {
        if let Some(main_win) = app.get_webview_window("main") {
            if let (Ok(main_pos), Ok(main_size), Ok(scale)) = (main_win.outer_position(), main_win.outer_size(), main_win.scale_factor()) {
                let main_logical_pos = main_pos.to_logical::<f64>(scale);
                let main_logical_size = main_size.to_logical::<f64>(scale);
                let center_x = main_logical_pos.x + (main_logical_size.width - 548.0) / 2.0;
                let center_y = main_logical_pos.y + (main_logical_size.height - 410.0) / 2.0;
                let _ = window.set_position(tauri::Position::Logical(tauri::LogicalPosition::new(center_x, center_y)));
            }
        }
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "connect_device",
        tauri::WebviewUrl::App("index.html#/connect".into())
    )
    .title("Connect Device")
    .inner_size(548.0, 410.0)
    .resizable(false)
    .decorations(false)
    .transparent(true)
    .shadow(false);

    if let Some(main_win) = app.get_webview_window("main") {
        if let (Ok(main_pos), Ok(main_size), Ok(scale)) = (main_win.outer_position(), main_win.outer_size(), main_win.scale_factor()) {
            let main_logical_pos = main_pos.to_logical::<f64>(scale);
            let main_logical_size = main_size.to_logical::<f64>(scale);
            
            let center_x = main_logical_pos.x + (main_logical_size.width - 548.0) / 2.0;
            let center_y = main_logical_pos.y + (main_logical_size.height - 410.0) / 2.0;
            
            builder = builder.position(center_x, center_y);
        } else {
            builder = builder.center();
        }
    } else {
        builder = builder.center();
    }

    if let Err(e) = builder.build() {
        if let Some(window) = app.get_webview_window("connect_device") {
            let _ = window.set_focus();
        } else {
            return Err(e.to_string());
        }
    }

    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Initialize scrcpy state
    let scrcpy_state = scrcpy::ScrcpyState::new();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(scrcpy_state)
        .setup(|app| {
            #[cfg(target_os = "macos")]
            {
                if let Ok(adb_path) = utils::get_adb_path(app.handle()) {
                    let _ = std::process::Command::new("codesign")
                        .arg("--force")
                        .arg("--sign")
                        .arg("-")
                        .arg(&adb_path)
                        .output();
                }
                if let Ok(scrcpy_path) = utils::get_scrcpy_path(app.handle()) {
                    let _ = std::process::Command::new("codesign")
                        .arg("--force")
                        .arg("--sign")
                        .arg("-")
                        .arg(&scrcpy_path)
                        .output();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_adb_path,
            get_scrcpy_path,
            verify_bundled_resources,
            test_scrcpy_execution,
            open_connect_window,
            // Device commands
            commands::get_connected_devices,
            commands::connect_wireless_device,
            commands::pair_wireless_device,
            commands::get_mdns_services,
            commands::disconnect_device,
            commands::enable_wireless_mode,
            commands::refresh_devices,
            commands::save_device,
            commands::get_saved_devices,
            commands::remove_saved_device,
            // Scrcpy commands
            commands::start_mirroring,
            commands::stop_mirroring,
            commands::stop_all_mirroring,
            commands::get_mirroring_status,
            commands::get_active_sessions,
            commands::get_process_stats,
            commands::check_scrcpy_available,
            commands::get_scrcpy_version,
            // Settings commands
            commands::save_settings,
            commands::load_settings,
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
