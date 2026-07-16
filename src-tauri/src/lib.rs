mod commands;
pub mod mcp;
pub mod utils;
use mirin_core::{scrcpy, device_registry};

use tauri::Manager;
use std::sync::Arc;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn submit_screenshot(
    registry: tauri::State<'_, mcp::screenshot::ScreenshotRegistry>,
    req_id: String,
    data_base64: String,
    width: u32,
    height: u32,
    annotated_elements: Vec<mirin_core::ui_extractor::UiElement>,
) -> Result<(), String> {
    registry
        .complete_request(
            req_id,
            mcp::screenshot::ScreenshotResult {
                data_base64,
                mime_type: "image/png".to_string(),
                width,
                height,
                annotated_elements,
            },
        )
        .await
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
    let scrcpy_path = utils::get_scrcpy_path(&app)?;
    let scrcpy_dir = utils::get_scrcpy_dir(&app)?;
    scrcpy::get_version(&scrcpy_path, &scrcpy_dir)
}

#[tauri::command]
async fn open_connect_window(app: tauri::AppHandle, mode: Option<String>) -> Result<(), String> {
    use tauri::Manager;

    let mut url = String::from("index.html#/connect");
    if let Some(m) = mode {
        url = format!("index.html#/connect?mode={}", urlencoding::encode(&m));
    }

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
        // If the window already exists, we could emit an event to change its mode, 
        // but for now, just focusing it is fine as per original logic.
        return Ok(());
    }

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        "connect_device",
        tauri::WebviewUrl::App(url.into())
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

#[tauri::command]
async fn open_mirror_window(
    app: tauri::AppHandle,
    device_id: String,
    device_name: String,
) -> Result<(), String> {
    open_mirror_window_impl(app, device_id, device_name).await
}

pub(crate) async fn open_mirror_window_impl(
    app: tauri::AppHandle,
    device_id: String,
    device_name: String,
) -> Result<(), String> {
    use tauri::Manager;

    let window_label = format!("mirror_{}", device_id.replace(':', "_").replace('.', "_"));

    if let Some(window) = app.get_webview_window(&window_label) {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }

    let encoded_id = urlencoding::encode(&device_id);
    let encoded_name = urlencoding::encode(&device_name);
    let url = format!("index.html#/mirror/{}?name={}", encoded_id, encoded_name);

    let mut builder = tauri::WebviewWindowBuilder::new(
        &app,
        &window_label,
        tauri::WebviewUrl::App(url.into()),
    )
    .title(format!("{} - Mirin", device_name))
    .inner_size(420.0, 840.0)
    .min_inner_size(300.0, 500.0)
    .resizable(true)
    .decorations(true);

    if let Some(main_win) = app.get_webview_window("main") {
        if let (Ok(main_pos), Ok(main_size), Ok(scale)) = (
            main_win.outer_position(),
            main_win.outer_size(),
            main_win.scale_factor(),
        ) {
            let main_logical_pos = main_pos.to_logical::<f64>(scale);
            let main_logical_size = main_size.to_logical::<f64>(scale);

            let center_x = main_logical_pos.x + (main_logical_size.width - 420.0) / 2.0 + 60.0;
            let center_y = main_logical_pos.y + (main_logical_size.height - 840.0) / 2.0;

            builder = builder.position(center_x, center_y);
        } else {
            builder = builder.center();
        }
    } else {
        builder = builder.center();
    }

    if let Err(e) = builder.build() {
        if let Some(window) = app.get_webview_window(&window_label) {
            let _ = window.set_focus();
        } else {
            return Err(e.to_string());
        }
    }

    Ok(())
}

#[tauri::command]
async fn close_current_window(window: tauri::WebviewWindow) -> Result<(), String> {
    let _ = window.close();
    let _ = window.destroy();
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let embedded_state = scrcpy::EmbeddedScrcpyState::new();
    let ui_extractor = mirin_core::ui_extractor::UiExtractor::new();
    let screenshot_registry = mcp::screenshot::ScreenshotRegistry::new();
    let logcat_state = commands::LogcatState::new();
    let device_registry = device_registry::DeviceRegistry::new();
    let device_registry_clone = device_registry.clone();
    
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(embedded_state.clone())
        .manage(ui_extractor.clone())
        .manage(screenshot_registry.clone())
        .manage(logcat_state)
        .manage(device_registry)
        .setup(move |app| {
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

            let bridge = Arc::new(mcp::McpBridge::new(
                app.handle().clone(),
                embedded_state,
                ui_extractor,
                screenshot_registry,
                device_registry_clone,
            ));
            tauri::async_runtime::spawn(async move {
                mcp::start_loopback_server(bridge).await;
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            submit_screenshot,
            get_adb_path,
            get_scrcpy_path,
            verify_bundled_resources,
            test_scrcpy_execution,
            open_connect_window,
            open_mirror_window,
            close_current_window,
            // Device commands
            commands::get_connected_devices,
            commands::connect_wireless_device,
            commands::pair_wireless_device,
            commands::get_mdns_services,
            commands::disconnect_device,
            commands::enable_wireless_mode,
            commands::switch_to_wireless,
            commands::refresh_devices,
            commands::save_device,
            commands::get_saved_devices,
            commands::remove_saved_device,
            commands::get_device_details,
            commands::get_resolved_devices,
            commands::forget_device,
            // Scrcpy commands
            commands::check_scrcpy_available,
            commands::get_scrcpy_version,
            // Embedded scrcpy commands
            commands::connect_embedded_mirror,
            commands::disconnect_embedded_mirror,
            commands::send_touch,
            commands::send_key,
            commands::send_text,
            commands::send_scroll,
            // Settings commands
            commands::save_settings,
            commands::load_settings,
            commands::clear_app_cache,
            // App commands
            commands::list_apps,
            commands::install_app,
            commands::uninstall_app,
            commands::launch_app,
            commands::clear_app_data,
            commands::stop_app,
            // File commands
            commands::list_files,
            commands::pull_file,
            commands::push_file,
            commands::delete_file,
            commands::create_directory,
            // Console commands
            commands::start_logcat,
            commands::stop_logcat,
            commands::execute_shell_command,
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                if window.label() == "main" {
                    if let Some(embedded_state) = window.try_state::<scrcpy::EmbeddedScrcpyState>() {
                        println!("Main window destroyed, cleaning up embedded scrcpy processes...");
                        let _ = embedded_state.stop_all();
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

