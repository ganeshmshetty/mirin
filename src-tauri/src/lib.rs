mod commands;
mod mcp;
use mirin_core::{device_registry, scrcpy};
use mirin_mcp::utils;

use std::sync::Arc;
use tauri::Manager;

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
async fn submit_screenshot(
    registry: tauri::State<'_, mirin_mcp::screenshot::ScreenshotRegistry>,
    req_id: String,
    data_base64: String,
    width: u32,
    height: u32,
    annotated_elements: Vec<mirin_core::ui_extractor::UiElement>,
) -> Result<(), String> {
    registry
        .complete_request(
            req_id,
            mirin_mcp::screenshot::ScreenshotResult {
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



/// Deterministically convert a device ID into a safe, valid Tauri window label.
///
/// Tauri window labels must only contain alphanumeric characters, `-`, `/`, `:`, and `_`.
/// Using hex encoding ensures that any device identifier (containing IPs with ports,
/// hardware serials, slashes, or special characters) is safely and bijectively mapped
/// without collisions or invalid characters.
pub fn device_id_to_window_label(device_id: &str) -> String {
    let hex: String = device_id
        .as_bytes()
        .iter()
        .map(|b| format!("{:02x}", b))
        .collect();
    format!("mirror_{}", hex)
}

/// Decode a mirror window label back into the original device ID.
/// Returns None if the label is not a valid mirror window label or contains invalid hex/utf8.
pub fn window_label_to_device_id(label: &str) -> Option<String> {
    let hex = label.strip_prefix("mirror_")?;
    if hex.is_empty() || hex.len() % 2 != 0 {
        return None;
    }
    let mut bytes = Vec::with_capacity(hex.len() / 2);
    for i in (0..hex.len()).step_by(2) {
        let byte = u8::from_str_radix(&hex[i..i + 2], 16).ok()?;
        bytes.push(byte);
    }
    String::from_utf8(bytes).ok()
}

/// Payload sent over Tauri IPC when a popout mirror window closes or is destroyed.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MirrorWindowClosedPayload {
    pub device_id: String,
}

/// Helper to bring an existing window forward: unminimize, show, and focus.
fn focus_and_unminimize_window(window: &tauri::WebviewWindow) -> Result<(), String> {
    let _ = window.unminimize();
    let _ = window.show();
    window.set_focus().map_err(|e| e.to_string())
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
    let window_label = device_id_to_window_label(&device_id);

    // Duplicate window check: unminimize, show, and focus
    if let Some(window) = app.get_webview_window(&window_label) {
        focus_and_unminimize_window(&window)?;
        return Ok(());
    }

    let encoded_id = urlencoding::encode(&device_id);
    let encoded_name = urlencoding::encode(&device_name);
    let url = format!("index.html#/mirror/{}?name={}", encoded_id, encoded_name);

    let mut builder =
        tauri::WebviewWindowBuilder::new(&app, &window_label, tauri::WebviewUrl::App(url.into()))
            .title(format!("{} - Mirin", device_name))
            .resizable(true)
            .decorations(true);

    // DPI & Monitor bounds calculation:
    // Determine the active monitor (from main window or primary/available monitor)
    let main_win = app.get_webview_window("main");
    let monitor = main_win
        .as_ref()
        .and_then(|w| w.current_monitor().ok().flatten())
        .or_else(|| app.primary_monitor().ok().flatten())
        .or_else(|| app.available_monitors().ok().and_then(|m| m.into_iter().next()));

    const DESIRED_WIDTH: f64 = 446.0;
    const DESIRED_HEIGHT: f64 = 840.0;
    const MIN_WIDTH: f64 = 250.0;
    const MIN_HEIGHT: f64 = 250.0;

    let (final_width, final_height, position) = if let Some(mon) = monitor {
        let scale = if mon.scale_factor() > 0.0 {
            mon.scale_factor()
        } else {
            1.0
        };
        let mon_x = mon.position().x as f64 / scale;
        let mon_y = mon.position().y as f64 / scale;
        let mon_w = mon.size().width as f64 / scale;
        let mon_h = mon.size().height as f64 / scale;

        // Constrain window size within monitor work area (margins for system dock / taskbar / menu bar)
        let max_w = (mon_w - 40.0).max(MIN_WIDTH);
        let max_h = (mon_h - 80.0).max(MIN_HEIGHT);
        let target_w = DESIRED_WIDTH.min(max_w);
        let target_h = DESIRED_HEIGHT.min(max_h);

        // Constrain initial positioning relative to main window if available
        let pos = if let Some(ref main_w) = main_win {
            if let (Ok(main_pos), Ok(main_size), Ok(win_scale)) = (
                main_w.outer_position(),
                main_w.outer_size(),
                main_w.scale_factor(),
            ) {
                let main_s = if win_scale > 0.0 { win_scale } else { scale };
                let main_logical_pos = main_pos.to_logical::<f64>(main_s);
                let main_logical_size = main_size.to_logical::<f64>(main_s);

                let ideal_x = main_logical_pos.x + (main_logical_size.width - target_w) / 2.0 + 60.0;
                let ideal_y = main_logical_pos.y + (main_logical_size.height - target_h) / 2.0;

                // Clamp strictly within monitor viewport
                let min_x = mon_x + 10.0;
                let max_x = (mon_x + mon_w - target_w - 10.0).max(min_x);
                let clamped_x = ideal_x.clamp(min_x, max_x);

                let min_y = mon_y + 30.0;
                let max_y = (mon_y + mon_h - target_h - 30.0).max(min_y);
                let clamped_y = ideal_y.clamp(min_y, max_y);

                Some((clamped_x, clamped_y))
            } else {
                None
            }
        } else {
            None
        };

        (target_w, target_h, pos)
    } else {
        (DESIRED_WIDTH, DESIRED_HEIGHT, None)
    };

    let min_w = MIN_WIDTH.min(final_width);
    let min_h = MIN_HEIGHT.min(final_height);
    builder = builder
        .inner_size(final_width, final_height)
        .min_inner_size(min_w, min_h);

    if let Some((x, y)) = position {
        builder = builder.position(x, y);
    } else {
        builder = builder.center();
    }

    if let Err(e) = builder.build() {
        if let Some(window) = app.get_webview_window(&window_label) {
            focus_and_unminimize_window(&window)?;
        } else {
            return Err(format!("Failed to create mirror window: {e}"));
        }
    }

    Ok(())
}

#[tauri::command]
async fn close_current_window(
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<(), String> {
    let label = window.label().to_string();
    if let Some(device_id) = window_label_to_device_id(&label) {
        if let Ok(adb_path) = utils::get_adb_path(&app) {
            let adb = mirin_core::adb::Adb::new(adb_path);
            if let Some(embedded_state) = app.try_state::<scrcpy::EmbeddedScrcpyState>() {
                let _ = embedded_state.stop(&adb, &device_id).await;
            }
        }
    }
    let _ = window.close();
    let _ = window.destroy();
    Ok(())
}

#[tauri::command]
async fn close_mirror_window(
    app: tauri::AppHandle,
    device_id: String,
) -> Result<(), String> {
    let window_label = device_id_to_window_label(&device_id);
    if let Some(window) = app.get_webview_window(&window_label) {
        if let Ok(adb_path) = utils::get_adb_path(&app) {
            let adb = mirin_core::adb::Adb::new(adb_path);
            if let Some(embedded_state) = app.try_state::<scrcpy::EmbeddedScrcpyState>() {
                let _ = embedded_state.stop(&adb, &device_id).await;
            }
        }
        let _ = window.close();
        let _ = window.destroy();
    }
    Ok(())
}

#[tauri::command]
async fn focus_mirror_window(
    app: tauri::AppHandle,
    device_id: String,
) -> Result<(), String> {
    let window_label = device_id_to_window_label(&device_id);
    if let Some(window) = app.get_webview_window(&window_label) {
        focus_and_unminimize_window(&window)?;
        Ok(())
    } else {
        Err(format!("Mirror window for device {device_id} not found"))
    }
}

#[tauri::command]
async fn focus_main_window(
    app: tauri::AppHandle,
) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("main") {
        focus_and_unminimize_window(&window)?;
        Ok(())
    } else {
        Err("Main window not found".to_string())
    }
}

#[tauri::command]
async fn is_mirror_window_open(
    app: tauri::AppHandle,
    device_id: String,
) -> Result<bool, String> {
    let window_label = device_id_to_window_label(&device_id);
    Ok(app.get_webview_window(&window_label).is_some())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let embedded_state = scrcpy::EmbeddedScrcpyState::new();
    let ui_extractor = mirin_core::ui_extractor::UiExtractor::new();
    let screenshot_registry = mirin_mcp::screenshot::ScreenshotRegistry::new();
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

            let server = mcp::build_server(
                app.handle().clone(),
                embedded_state,
                ui_extractor,
                screenshot_registry,
                device_registry_clone,
                Some(Arc::new(|app_handle, serial, model| {
                    Box::pin(
                        async move { open_mirror_window_impl(app_handle, serial, model).await },
                    )
                })),
            );
            tauri::async_runtime::spawn(async move {
                if let Err(error) = mcp::serve(server).await {
                    eprintln!("[MCP] server stopped: {error}");
                }
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
            open_mirror_window,
            close_current_window,
            close_mirror_window,
            focus_mirror_window,
            focus_main_window,
            is_mirror_window_open,
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
            commands::get_device_wallpaper,
            // Scrcpy commands
            commands::check_scrcpy_available,
            commands::get_scrcpy_version,
            // Embedded scrcpy commands
            commands::connect_embedded_mirror,
            commands::disconnect_embedded_mirror,
            commands::set_orientation,
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
            use tauri::Emitter;
            match event {
                tauri::WindowEvent::Destroyed => {
                    let label = window.label();
                    if label == "main" {
                        if let Some(embedded_state) = window.try_state::<scrcpy::EmbeddedScrcpyState>()
                        {
                            println!("Main window destroyed, cleaning up embedded scrcpy processes...");
                            let _ = embedded_state.stop_all();
                        }
                    } else if let Some(device_id) = window_label_to_device_id(label) {
                        let app_handle = window.app_handle().clone();
                        let d_id = device_id.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Ok(adb_path) = utils::get_adb_path(&app_handle) {
                                let adb = mirin_core::adb::Adb::new(adb_path);
                                if let Some(embedded_state) = app_handle.try_state::<scrcpy::EmbeddedScrcpyState>() {
                                    let _ = embedded_state.stop(&adb, &d_id).await;
                                }
                            }
                        });
                        let _ = window.app_handle().emit(
                            "mirror-window-closed",
                            MirrorWindowClosedPayload {
                                device_id,
                            },
                        );
                    }
                }
                tauri::WindowEvent::CloseRequested { .. } => {
                    let label = window.label();
                    if let Some(device_id) = window_label_to_device_id(label) {
                        let app_handle = window.app_handle().clone();
                        let d_id = device_id.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Ok(adb_path) = utils::get_adb_path(&app_handle) {
                                let adb = mirin_core::adb::Adb::new(adb_path);
                                if let Some(embedded_state) = app_handle.try_state::<scrcpy::EmbeddedScrcpyState>() {
                                    let _ = embedded_state.stop(&adb, &d_id).await;
                                }
                            }
                        });
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_id_to_window_label_roundtrip() {
        let test_cases = vec![
            "192.168.1.10:5555",
            "emulator-5554",
            "R58M123456X",
            "10.0.0.1:5555",
            "device/with/slashes:5555",
            "device-with-dashes-and_underscores",
            "192.168.1.10.5555",
            "Pixel 7 Pro",
            "special!@#$%^&*()_+",
        ];

        for device_id in test_cases {
            let label = device_id_to_window_label(device_id);
            assert!(
                label.starts_with("mirror_"),
                "Label must have mirror_ prefix: {}",
                label
            );
            assert!(
                label.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'),
                "Label contains invalid characters: {}",
                label
            );
            let decoded = window_label_to_device_id(&label);
            assert_eq!(
                decoded.as_deref(),
                Some(device_id),
                "Roundtrip failed for: {}",
                device_id
            );
        }
    }

    #[test]
    fn test_window_label_to_device_id_invalid_inputs() {
        assert_eq!(window_label_to_device_id("main"), None);
        assert_eq!(window_label_to_device_id("connect_device"), None);
        assert_eq!(window_label_to_device_id("mirror_"), None);
        assert_eq!(window_label_to_device_id("mirror_1"), None);
        assert_eq!(window_label_to_device_id("mirror_zz"), None);
        assert_eq!(window_label_to_device_id("other_1234"), None);
    }

    #[test]
    fn test_mirror_window_closed_payload_serialization() {
        let payload = MirrorWindowClosedPayload {
            device_id: "192.168.1.10:5555".to_string(),
        };
        let json = serde_json::to_string(&payload).unwrap();
        assert_eq!(json, r#"{"deviceId":"192.168.1.10:5555"}"#);

        let deserialized: MirrorWindowClosedPayload = serde_json::from_str(&json).unwrap();
        assert_eq!(deserialized, payload);
    }
}
