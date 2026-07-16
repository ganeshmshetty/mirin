use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::Mutex as TokioMutex;
use tokio::time::sleep;
use mirin_core::adb::Adb;
use crate::screenshot::ScreenshotRegistry;
use mirin_core::ui_extractor::UiExtractor;
use mirin_core::scrcpy::{control, EmbeddedScrcpyState};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScriptStep {
    pub action: String, // "tap", "long_press", "swipe", "type_text", "press_key", "sleep"
    pub selector: Option<String>,
    pub x: Option<f32>,
    pub y: Option<f32>,
    pub end_x: Option<f32>,
    pub end_y: Option<f32>,
    pub text: Option<String>,
    pub keycode: Option<u32>,
    pub duration_ms: Option<u64>,
}

pub type OpenMirrorWindowCallback<R = tauri::Wry> = Arc<
    dyn Fn(
        tauri::AppHandle<R>,
        String,
        String,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>>
        + Send
        + Sync,
>;

#[derive(Clone)]
pub struct ToolDispatcher<R: tauri::Runtime = tauri::Wry> {
    app: AppHandle<R>,
    state: EmbeddedScrcpyState,
    pub ui_extractor: UiExtractor,
    pub screenshot_registry: ScreenshotRegistry,
    pub current_device: Arc<Mutex<Option<String>>>,
    pub device_registry: mirin_core::device_registry::DeviceRegistry,
    pub open_mirror_window_fn: Option<OpenMirrorWindowCallback<R>>,
}

impl<R: tauri::Runtime> ToolDispatcher<R> {
    pub fn new(
        app: AppHandle<R>,
        state: EmbeddedScrcpyState,
        ui_extractor: UiExtractor,
        screenshot_registry: ScreenshotRegistry,
        device_registry: mirin_core::device_registry::DeviceRegistry,
        open_mirror_window_fn: Option<OpenMirrorWindowCallback<R>>,
    ) -> Self {
        Self {
            app,
            state,
            ui_extractor,
            screenshot_registry,
            current_device: Arc::new(Mutex::new(None)),
            device_registry,
            open_mirror_window_fn,
        }
    }

    fn get_serial(&self, args: &Value) -> Result<String, String> {
        if let Some(serial) = args["serial"].as_str() {
            let s = serial.trim();
            if !s.is_empty() {
                return Ok(s.to_string());
            }
        }
        let current = self.current_device.lock().map_err(|e| e.to_string())?;
        current.clone().ok_or_else(|| "No serial provided and no device connected. Call connect_device first or provide 'serial'.".to_string())
    }

    /// Built once at first call — `tools/list` is hot and the schema is static.
    pub fn get_tools_list() -> Vec<Value> {
        use std::sync::OnceLock;
        static TOOLS: OnceLock<Vec<Value>> = OnceLock::new();
        TOOLS.get_or_init(Self::build_tools_list).clone()
    }

    fn build_tools_list() -> Vec<Value> {
        vec![
            json!({
                "name": "list_devices",
                "description": "Get a list of all connected Android devices (USB and Wireless) with status and connection type.",
                "inputSchema": { "type": "object", "properties": {} }
            }),
            json!({
                "name": "connect_device",
                "description": "Ensure an embedded scrcpy mirroring session is running and ready for control commands. Reuses existing session if already active. Serial is optional if already connected.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "popup": { "type": "boolean", "description": "If true, also open a popup mirror window for this device" }
                    }
                }
            }),
            json!({
                "name": "disconnect_device",
                "description": "Stop the embedded scrcpy mirroring session for a device and clean up ADB forward/reverse tunnels.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "serial": { "type": "string" } }
                }
            }),
            json!({
                "name": "get_screen",
                "description": "Get the current UI element tree of the device. Returns sanitized interactive elements with numeric IDs ([1], [2]...) unless raw=true.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "raw": { "type": "boolean", "description": "If true, includes full uiautomator XML" }
                    }
                }
            }),
            json!({
                "name": "get_screenshot",
                "description": "Get a live screenshot of the device. If annotate=true, draws Set-of-Mark numbered badges corresponding to element IDs.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "annotate": { "type": "boolean", "description": "Draw numbered bounding boxes on image" }
                    }
                }
            }),
            json!({
                "name": "find_element",
                "description": "Find a UI element by numeric ID, exact/substring text, content description, or resource ID.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string" }
                    },
                    "required": ["selector"]
                }
            }),
            json!({
                "name": "tap",
                "description": "Tap on a UI element (by selector) or exact normalized/absolute coordinates. Requires an active scrcpy mirror session (use connect_device first).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string" },
                        "x": { "type": "number" },
                        "y": { "type": "number" },
                        "coordinate_mode": { "type": "string", "enum": ["absolute", "normalized"], "default": "absolute", "description": "When 'normalized', x/y are 0.0-1.0 fractions of the display" }
                    }
                }
            }),
            json!({
                "name": "long_press",
                "description": "Long press on a UI element or coordinates for specified duration (default 800ms, max 5000ms). Requires an active scrcpy mirror session.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string" },
                        "x": { "type": "number" },
                        "y": { "type": "number" },
                        "duration_ms": { "type": "integer", "default": 800 },
                        "coordinate_mode": { "type": "string", "enum": ["absolute", "normalized"], "default": "absolute", "description": "When 'normalized', x/y are 0.0-1.0 fractions of the display" }
                    }
                }
            }),
            json!({
                "name": "swipe",
                "description": "Swipe across the screen from start coordinates to end coordinates. Requires an active scrcpy mirror session. Supports 'selector' (ignores start_x/start_y) or raw coordinates (start_x/start_y → end_x/end_y).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string", "description": "If provided, swipes from this element's center. Ignore start_x/start_y." },
                        "start_x": { "type": "number" },
                        "start_y": { "type": "number" },
                        "end_x": { "type": "number" },
                        "end_y": { "type": "number" },
                        "duration_ms": { "type": "integer", "default": 300 },
                        "coordinate_mode": { "type": "string", "enum": ["absolute", "normalized"], "default": "absolute", "description": "When 'normalized', coordinates are 0.0-1.0 fractions of the display" }
                    }
                }
            }),
            json!({
                "name": "drag",
                "description": "Drag from start coordinates to end coordinates (slower than swipe with initial 200ms hold). Requires an active scrcpy mirror session. Supports 'selector' or raw start_x/start_y.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string", "description": "If provided, drags from this element's center. Ignore start_x/start_y." },
                        "start_x": { "type": "number" },
                        "start_y": { "type": "number" },
                        "end_x": { "type": "number" },
                        "end_y": { "type": "number" },
                        "duration_ms": { "type": "integer", "default": 800 },
                        "coordinate_mode": { "type": "string", "enum": ["absolute", "normalized"], "default": "absolute", "description": "When 'normalized', coordinates are 0.0-1.0 fractions of the display" }
                    }
                }
            }),
            json!({
                "name": "scroll_to",
                "description": "Scroll up or down until a selector becomes visible. Best-effort: may not work on WebViews, LazyColumn, or custom scroll containers. Re-checks selector after each swipe.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string" },
                        "direction": { "type": "string", "enum": ["up", "down"], "default": "down" },
                        "max_swipes": { "type": "integer", "default": 5 }
                    },
                    "required": ["selector"]
                }
            }),
            json!({
                "name": "type_text",
                "description": "Type UTF-8 text directly into the focused input field.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "text": { "type": "string" }
                    },
                    "required": ["text"]
                }
            }),
            json!({
                "name": "press_key",
                "description": "Press an Android keycode (e.g. 3 for HOME, 4 for BACK, 66 for ENTER).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "keycode": { "type": "integer" }
                    },
                    "required": ["keycode"]
                }
            }),
            json!({
                "name": "hide_keyboard",
                "description": "Hide the on-screen keyboard by sending BACK key when keyboard is open. Best-effort: sends BACK regardless of whether keyboard detection succeeds (dumpsys check is unreliable on some ROMs).",
                "inputSchema": {
                    "type": "object",
                    "properties": { "serial": { "type": "string" } }
                }
            }),
            json!({
                "name": "clipboard",
                "description": "Get or set device clipboard text. Set requires scrcpy session (preferred) or falls back to 'cmd clipboard set-text'. Get tries scrcpy control socket first, falls back to 'service call clipboard' hex-parcel parser (best-effort on MIUI/encrypted devices).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "action": { "type": "string", "enum": ["get", "set"] },
                        "text": { "type": "string" }
                    },
                    "required": ["action"]
                }
            }),
            json!({
                "name": "set_orientation",
                "description": "Set device rotation orientation. Uses 'settings put system user_rotation'. May not persist on all devices; auto-rotate is disabled first. Best-effort on non-stock ROMs.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "orientation": { "type": "string", "enum": ["portrait", "landscape"] }
                    },
                    "required": ["orientation"]
                }
            }),
            json!({
                "name": "list_apps",
                "description": "List installed package names on the device.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "third_party_only": { "type": "boolean", "default": true }
                    }
                }
            }),
            json!({
                "name": "launch_app",
                "description": "Launch an app by package name. Resolves launcher activity without using monkey.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "package": { "type": "string" },
                        "activity": { "type": "string" }
                    },
                    "required": ["package"]
                }
            }),
            json!({
                "name": "stop_app",
                "description": "Force stop an app package.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "package": { "type": "string" }
                    },
                    "required": ["package"]
                }
            }),
            json!({
                "name": "get_current_activity",
                "description": "Get the top resumed activity / package currently on screen.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "serial": { "type": "string" } }
                }
            }),
            json!({
                "name": "grant_permission",
                "description": "Grant a runtime permission to an app package.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "package": { "type": "string" },
                        "permission": { "type": "string" }
                    },
                    "required": ["package", "permission"]
                }
            }),
            json!({
                "name": "revoke_permission",
                "description": "Revoke a runtime permission from an app package.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "package": { "type": "string" },
                        "permission": { "type": "string" }
                    },
                    "required": ["package", "permission"]
                }
            }),
            json!({
                "name": "handle_dialog",
                "description": "Click accept/allow or dismiss/deny buttons on dialogs by matching button text. Best-effort: text matching is fragile, only handles known button labels. May not work on all ROMs or non-English UIs.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "action": { "type": "string", "enum": ["accept", "dismiss"], "default": "accept" }
                    },
                    "required": ["action"]
                }
            }),
            json!({
                "name": "get_logcat",
                "description": "Get recent logcat lines with optional package or tag filtering.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "lines": { "type": "integer", "default": 100 },
                        "package_filter": { "type": "string" },
                        "tag_filter": { "type": "string" }
                    }
                }
            }),
            json!({
                "name": "run_script",
                "description": "Execute a multi-step sequence of actions (max 50 steps), re-resolving selectors dynamically at each step. Steps run sequentially with 150ms gap. If any step fails, the entire script aborts with the step error.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "steps": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "action": { "type": "string" },
                                    "selector": { "type": "string" },
                                    "x": { "type": "number" },
                                    "y": { "type": "number" },
                                    "end_x": { "type": "number" },
                                    "end_y": { "type": "number" },
                                    "text": { "type": "string" },
                                    "keycode": { "type": "integer" },
                                    "duration_ms": { "type": "integer" }
                                },
                                "required": ["action"]
                            }
                        }
                    },
                    "required": ["steps"]
                }
            }),
        ]
    }

    pub fn call_tool<'a>(&'a self, name: &'a str, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, String>> + Send + 'a>> {
        Box::pin(async move {
            let adb = Adb::new(crate::utils::get_adb_path(&self.app)?);

            match name {
                "list_devices" => {
                    let adb_path = crate::utils::get_adb_path(&self.app)?;
                    let devices: Vec<mirin_core::device_registry::Device> = self.device_registry.get_resolved_devices(adb_path).await?;
                    Ok(serde_json::to_value(devices).map_err(|e| format!("Serialization error: {}", e))?)
                }
                "connect_device" => {
                    let serial = self.get_serial(&args)?;
                    let device_lock = self.state.lock_device_connect(&serial).await;
                    let _guard = device_lock.lock().await;

                    if let Ok((sock, w, h)) = self.state.get_session_info(&serial) {
                        let is_alive = {
                            let stream = sock.lock().await;
                            let mut buf = [0u8; 1];
                            match stream.try_read(&mut buf) {
                                Ok(0) => false,
                                Ok(_) => true,
                                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => true,
                                Err(_) => false,
                            }
                        };
                        if is_alive {
                            return Ok(json!({ "status": "already_connected", "width": w, "height": h }));
                        }
                        let _ = self.state.remove_session(&serial);
                    }

                    let scrcpy_server_path = crate::utils::get_scrcpy_server_path(&self.app)?;
                    let scrcpy_path = crate::utils::get_scrcpy_path(&self.app)?;
                    let scrcpy_dir = crate::utils::get_scrcpy_dir(&self.app)?;
                    let scrcpy_version = mirin_core::scrcpy::get_version_number(&scrcpy_path, &scrcpy_dir);
                    let opts = mirin_core::scrcpy::stream::EmbeddedStreamSettings::default();

                    let streams = mirin_core::scrcpy::stream::start_server(&adb, &serial, &scrcpy_server_path, &scrcpy_version, &opts)
                        .await
                        .map_err(|e| format!("Failed to start embedded server: {}", e))?;
                    let (width, height) = (streams.screen_width, streams.screen_height);
                    let shutdown = Arc::new(tokio::sync::Notify::new());

                    let mut video_socket = streams.video_socket;
                    let shutdown_clone = shutdown.clone();
                    tokio::spawn(async move {
                        let mut buf = [0u8; 4096];
                        loop {
                            tokio::select! {
                                res = tokio::io::AsyncReadExt::read(&mut video_socket, &mut buf) => {
                                    match res {
                                        Ok(0) | Err(_) => break,
                                        Ok(_) => {}
                                    }
                                }
                                _ = shutdown_clone.notified() => break,
                            }
                        }
                    });

                    let session = mirin_core::scrcpy::EmbeddedSessionInfo {
                        control_socket: Arc::new(TokioMutex::new(streams.control_socket)),
                        shutdown_notify: shutdown,
                        screen_width: width,
                        screen_height: height,
                        port: streams.port,
                        server_process: streams.server_process,
                    };

                    self.state.add_session(serial.clone(), session)?;

                    // Save serial so future tools don't need it
                    if let Ok(mut cur) = self.current_device.lock() {
                        *cur = Some(serial.clone());
                    }

                    // Optional popup mirror window
                    if args.get("popup").and_then(|v| v.as_bool()).unwrap_or(false) {
                        let model = adb.with_device(&serial)
                            .execute(&["shell", "getprop", "ro.product.model"])
                            .await
                            .unwrap_or_else(|_| serial.clone());
                        if let Some(ref open_fn) = self.open_mirror_window_fn {
                            let _ = open_fn(self.app.clone(), serial, model).await;
                        }
                    }

                    Ok(json!({ "status": "connected", "width": width, "height": height }))
                }
                "disconnect_device" => {
                    let serial = self.get_serial(&args)?;
                    let mut session = self.state.remove_session(&serial).map_err(|_| format!("No active session for device {}", serial))?.ok_or_else(|| format!("No active session for device {}", serial))?;
                    session.shutdown_notify.notify_one();
                    let _ = session.server_process.kill().await;
                    mirin_core::scrcpy::stream::stop_server(&adb, &serial, session.port).await;
                    if let Ok(mut cur) = self.current_device.lock() {
                        *cur = None;
                    }
                    Ok(json!({ "status": "disconnected" }))
                }
                "get_screen" => {
                    let serial = self.get_serial(&args)?;
                    let raw = args["raw"].as_bool().unwrap_or(false);
                    let tree = self.ui_extractor.get_tree(&adb, &serial, raw, true).await?;
                    Ok(serde_json::to_value(tree).map_err(|e| format!("Serialization error: {}", e))?)
                }
                "get_screenshot" => {
                    let serial = self.get_serial(&args)?;
                    let annotate = args["annotate"].as_bool().unwrap_or(false);
                    let res = self
                        .screenshot_registry
                        .capture(&self.app, &self.ui_extractor, &serial, annotate)
                        .await?;
                    Ok(serde_json::to_value(res).map_err(|e| format!("Serialization error: {}", e))?)
                }
                "find_element" => {
                    let serial = self.get_serial(&args)?;
                    let selector = args["selector"].as_str().ok_or("Missing selector")?;
                    if selector.trim().is_empty() {
                        return Err("Selector must not be empty".to_string());
                    }
                    let (x, y, el) = self.ui_extractor.resolve_selector(&adb, &serial, selector).await?;
                    Ok(json!({ "center_x": x, "center_y": y, "element": el }))
                }
                "tap" => {
                    let serial = self.get_serial(&args)?;
                    let (socket, _w, _h) = self.state.get_session_info(&serial).map_err(|_| "No mirror session for this device. Call connect_device first.".to_string())?;
                    let (abs_x, abs_y, dsp_w, dsp_h) = self.resolve_abs_coords(&adb, &serial, &args, _w, _h).await?;
                    control::inject_touch(&socket, "down", abs_x, abs_y, dsp_w as u16, dsp_h as u16).await.map_err(|e| format!("Touch down failed: {}", e))?;
                    sleep(Duration::from_millis(50)).await;
                    let _ = control::inject_touch(&socket, "up", abs_x, abs_y, dsp_w as u16, dsp_h as u16).await;
                    Ok(json!({ "success": true, "x": abs_x, "y": abs_y }))
                }
                "long_press" => {
                    let serial = self.get_serial(&args)?;
                    let duration_ms = args["duration_ms"].as_u64().unwrap_or(800).clamp(50, 5000);
                    let (socket, _w, _h) = self.state.get_session_info(&serial).map_err(|_| "No mirror session for this device. Call connect_device first.".to_string())?;
                    let (abs_x, abs_y, dsp_w, dsp_h) = self.resolve_abs_coords(&adb, &serial, &args, _w, _h).await?;
                    control::inject_touch(&socket, "down", abs_x, abs_y, dsp_w as u16, dsp_h as u16).await.map_err(|e| format!("Touch down failed: {}", e))?;
                    sleep(Duration::from_millis(duration_ms)).await;
                    let _ = control::inject_touch(&socket, "up", abs_x, abs_y, dsp_w as u16, dsp_h as u16).await;
                    Ok(json!({ "success": true }))
                }
                "swipe" | "drag" => {
                    let serial = self.get_serial(&args)?;
                    let is_drag = name == "drag";
                    let duration_ms = args["duration_ms"].as_u64().unwrap_or(if is_drag { 800 } else { 300 }).clamp(50, 10000);
                    let (socket, sess_w, sess_h) = self.state.get_session_info(&serial).map_err(|_| "No mirror session for this device. Call connect_device first.".to_string())?;

                    // Resolve start: selector or start_x/start_y
                    let (sx, sy, dsp_w, dsp_h) = if args.get("selector").and_then(|v| v.as_str()).is_some() || args.get("start_x").and_then(|v| v.as_f64()).is_some() {
                        self.resolve_abs_coords(&adb, &serial, &args, sess_w, sess_h).await?
                    } else {
                        return Err("Must provide either 'selector' or 'start_x'/'start_y' for the start point".to_string());
                    };

                    // Resolve end point
                    let (ex, ey) = {
                        let exv = args.get("end_x").and_then(|v| v.as_f64()).ok_or("Missing 'end_x' (required for swipe/drag)")? as f32;
                        let eyv = args.get("end_y").and_then(|v| v.as_f64()).ok_or("Missing 'end_y' (required for swipe/drag)")? as f32;
                        let mode = args.get("coordinate_mode").and_then(|v| v.as_str()).unwrap_or("absolute");
                        let clamp = |v: f32, max: u32| -> u32 {
                            let raw = if mode == "normalized" { (v * max as f32).round() as u32 } else { v as u32 };
                            if max == 0 { 0 } else if raw >= max { max - 1 } else { raw }
                        };
                        (clamp(exv, dsp_w), clamp(eyv, dsp_h))
                    };

                    control::inject_touch(&socket, "down", sx, sy, dsp_w as u16, dsp_h as u16).await.map_err(|e| format!("Touch down failed: {}", e))?;

                    if is_drag {
                        sleep(Duration::from_millis(200)).await;
                    }
                    let steps = 15.max(1);
                    let step_delay = (duration_ms / steps).max(5);
                    for i in 1..=steps {
                        let t = i as f32 / steps as f32;
                        let cx = (sx as f32 + (ex as f32 - sx as f32) * t).round() as u32;
                        let cy = (sy as f32 + (ey as f32 - sy as f32) * t).round() as u32;
                        control::inject_touch(&socket, "move", cx, cy, dsp_w as u16, dsp_h as u16).await.map_err(|e| format!("Touch move failed: {}", e))?;
                        sleep(Duration::from_millis(step_delay)).await;
                    }

                    let _ = control::inject_touch(&socket, "up", ex, ey, dsp_w as u16, dsp_h as u16).await;
                    Ok(json!({ "success": true }))
                }
                "scroll_to" => {
                    let serial = self.get_serial(&args)?;
                    let selector = args["selector"].as_str().ok_or("Missing selector")?;
                    let direction = args["direction"].as_str().unwrap_or("down");
                    if direction != "up" && direction != "down" {
                        return Err("direction must be 'up' or 'down'".to_string());
                    }
                    let max_swipes = args["max_swipes"].as_u64().unwrap_or(5).clamp(1, 50);
                    let (socket, w, h) = self.state.get_session_info(&serial).map_err(|_| "No mirror session for this device. Call connect_device first.".to_string())?;
                    let w = w.max(1);
                    let h = h.max(1);
                    let center_x = w / 2;
                    let start_y = if direction == "down" { h * 3 / 4 } else { h / 4 };
                    let end_y = if direction == "down" { h / 4 } else { h * 3 / 4 };
                    
                    for attempt in 0..max_swipes {
                        if let Ok((x, y, _)) = self.ui_extractor.resolve_selector(&adb, &serial, selector).await {
                            return Ok(json!({ "success": true, "found": true, "x": x, "y": y, "attempts": attempt }));
                        }
                        control::inject_touch(&socket, "down", center_x, start_y, w as u16, h as u16).await.map_err(|e| format!("Touch down failed: {}", e))?;
                        let steps = 10;
                        for i in 1..=steps {
                            let t = i as f32 / steps as f32;
                            let cy = (start_y as f32 + (end_y as f32 - start_y as f32) * t).round() as u32;
                            control::inject_touch(&socket, "move", center_x, cy, w as u16, h as u16).await.map_err(|e| format!("Touch move failed: {}", e))?;
                            sleep(Duration::from_millis(15)).await;
                        }
                        control::inject_touch(&socket, "up", center_x, end_y, w as u16, h as u16).await.map_err(|e| format!("Touch up failed: {}", e))?;
                        sleep(Duration::from_millis(500)).await;
                    }
                    Ok(json!({ "success": true, "found": false, "attempts": max_swipes, "note": "Selector not found after scrolling. Try increasing max_swipes or check the selector text." }))
                }
                "type_text" => {
                    let serial = self.get_serial(&args)?;
                    let text = args["text"].as_str().ok_or("Missing text")?;
                    if text.is_empty() {
                        return Ok(json!({ "success": true, "note": "Empty text — nothing to type" }));
                    }
                    if text.len() > 10000 {
                        return Err("Text too long (max 10000 characters)".to_string());
                    }
                    let socket = self.state.get_control_socket(&serial).map_err(|_| "No mirror session for this device. Call connect_device first.".to_string())?;
                    control::inject_text(&socket, text).await.map_err(|e| format!("Text injection failed: {}", e))?;
                    Ok(json!({ "success": true }))
                }
                "press_key" => {
                    let serial = self.get_serial(&args)?;
                    let keycode = args["keycode"].as_u64().ok_or("Missing keycode")?;
                    if keycode > 300 {
                        return Err(format!("Invalid keycode {} (must be 0-300)", keycode));
                    }
                    let keycode = keycode as u32;
                    let socket = self.state.get_control_socket(&serial).map_err(|_| "No mirror session for this device. Call connect_device first.".to_string())?;
                    control::inject_keycode(&socket, "down", keycode, 0, 0).await.map_err(|e| format!("Key down failed: {}", e))?;
                    control::inject_keycode(&socket, "up", keycode, 0, 0).await.map_err(|e| format!("Key up failed: {}", e))?;
                    Ok(json!({ "success": true }))
                }
                "hide_keyboard" => {
                    let serial = self.get_serial(&args)?;
                    // Always send BACK key — dumpsys input_method is unreliable on many ROMs.
                    // The BACK key is harmless when no keyboard is open (goes to previous screen).
                    if let Ok(socket) = self.state.get_control_socket(&serial) {
                        let _ = control::inject_keycode(&socket, "down", control::KEYCODE_BACK, 0, 0).await;
                        let _ = control::inject_keycode(&socket, "up", control::KEYCODE_BACK, 0, 0).await;
                    }
                    // Also try adb shell input keyevent BACK as secondary fallback
                    let _ =                     adb.with_device(&serial).execute(&["shell", "input", "keyevent", "4"]).await;
                    Ok(json!({ "success": true }))
                }
                "clipboard" => {
                    let serial = self.get_serial(&args)?;
                    let action = args["action"].as_str().ok_or("Missing action")?;
                    if action != "set" && action != "get" {
                        return Err("action must be 'set' or 'get'".to_string());
                    }
                    let adb = adb.with_device(&serial);
                    if action == "set" {
                        let text = args["text"].as_str().ok_or("Missing 'text' for clipboard set")?;
                        if text.len() > 100000 {
                            return Err("Clipboard text too long (max 100000 bytes)".to_string());
                        }
                        if let Ok(socket) = self.state.get_control_socket(&serial) {
                            control::set_clipboard(&socket, text).await.map_err(|e| format!("Scrcpy clipboard set failed: {}", e))?;
                            return Ok(json!({ "success": true, "method": "scrcpy_control" }));
                        }
                        // Fallback: `cmd clipboard set-text`. Note: on MIUI this exits 0 but silently
                        // does nothing. We try it, then read back to verify.
                        let escaped = format!("'{}'", text.replace('\'', "'\\''"));
                        let _ = adb.execute(&["shell", "cmd", "clipboard", "set-text", &escaped]).await;
                        // Verify: read back and check if it took effect
                        let verify = adb.execute(&["shell", "service", "call", "clipboard", "4", "s16", "com.android.shell"]).await;
                        let verify_text = verify.ok().and_then(|out| parse_clipboard_parcel(&out)).unwrap_or_default();
                        if verify_text == text || (!verify_text.is_empty() && text.contains(&verify_text)) {
                            return Ok(json!({ "success": true, "method": "cmd_clipboard" }));
                        }
                        Err("Clipboard set via 'cmd clipboard' failed (common on MIUI/encrypted devices). Start a mirror session via connect_device and retry.".to_string())
                    } else {
                        // Try scrcpy control socket (reliable, works on all devices with session).
                        if let Ok(socket) = self.state.get_control_socket(&serial) {
                            if let Ok(text) = control::get_clipboard(&socket).await {
                                return Ok(json!({ "clipboard": text, "method": "scrcpy_control" }));
                            }
                        }
                        // Fallback: service call clipboard + hex Parcel parser.
                        // Best-effort: works on many devices but may fail on encrypted/MIUI ROMs.
                        let out = adb.execute(&["shell", "service", "call", "clipboard", "4", "s16", "com.android.shell"]).await?;
                        let text = parse_clipboard_parcel(&out);
                        match text {
                            Some(t) if !t.is_empty() => Ok(json!({ "clipboard": t, "method": "service_call_parcel" })),
                            _ => Err("Clipboard get returned empty. Try connecting a mirror session first (connect_device), or the clipboard may be empty or encrypted.".to_string()),
                        }
                    }
                }
                "set_orientation" => {
                    let serial = self.get_serial(&args)?;
                    let orient = args["orientation"].as_str().ok_or("Missing orientation")?;
                    let val = match orient {
                        "portrait" => "0",
                        "landscape" => "1",
                        _ => return Err("orientation must be 'portrait' or 'landscape'".to_string()),
                    };
                    let adb = adb.with_device(&serial);
                    // Disable auto-rotate first, then set rotation
                    let _ = adb.execute(&["shell", "settings", "put", "system", "accelerometer_rotation", "0"]).await;
                    adb.execute(&["shell", "settings", "put", "system", "user_rotation", val]).await
                        .map_err(|e| format!("Failed to set orientation: {}. Device may not support settings override.", e))?;
                    Ok(json!({ "success": true }))
                }
                "list_apps" => {
                    let serial = self.get_serial(&args)?;
                    let third_party = args["third_party_only"].as_bool().unwrap_or(true);
                    let mut command = vec!["shell", "pm", "list", "packages"];
                    if third_party {
                        command.push("-3");
                    }
                    let out = adb.with_device(&serial).execute(&command).await?;
                    let packages: Vec<String> = out
                        .lines()
                        .filter_map(|l| l.trim().strip_prefix("package:").map(|s| s.to_string()))
                        .collect();
                    if packages.is_empty() {
                        return Ok(json!({ "packages": [], "note": "No packages found. Is the device authorized?" }));
                    }
                    Ok(json!({ "packages": packages }))
                }
                "launch_app" => {
                    let serial = self.get_serial(&args)?;
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    if pkg.is_empty() { return Err("Package name must not be empty".to_string()); }
                    let adb = adb.with_device(&serial);
                    if let Some(act) = args["activity"].as_str() {
                        if act.is_empty() { return Err("Activity name must not be empty".to_string()); }
                        let comp = format!("{}/{}", pkg, act);
                        adb.execute(&["shell", "am", "start", "-n", &comp]).await
                            .map_err(|e| format!("Failed to start {}/{}: {}", pkg, act, e))?;
                    } else {
                        let out = adb.execute(&["shell", "cmd", "package", "resolve-activity", "--brief", pkg]).await
                            .map_err(|e| format!("Failed to resolve activity for '{}': {}", pkg, e))?;
                        let resolved = out.lines().last().unwrap_or("").trim();
                        if resolved.contains('/') && !resolved.contains("No activity found") {
                            adb.execute(&["shell", "am", "start", "-n", resolved]).await
                                .map_err(|e| format!("Failed to start resolved activity '{}': {}", resolved, e))?;
                        } else {
                            return Err(format!("Could not resolve launcher activity for package '{}'. Try specifying 'activity' explicitly, or check the package name.", pkg));
                        }
                    }
                    Ok(json!({ "success": true }))
                }
                "stop_app" => {
                    let serial = self.get_serial(&args)?;
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    if pkg.is_empty() { return Err("Package name must not be empty".to_string()); }
                    adb.with_device(&serial).execute(&["shell", "am", "force-stop", pkg]).await
                        .map_err(|e| format!("Failed to force-stop '{}': {}", pkg, e))?;
                    Ok(json!({ "success": true }))
                }
                "get_current_activity" => {
                    let serial = self.get_serial(&args)?;
                    let adb = adb.with_device(&serial);
                    // Try dumpsys activity activities first (standard), fall back to dumpsys activity recents
                    let out = match adb.execute(&["shell", "dumpsys", "activity", "activities"]).await {
                        Ok(o) => o,
                        Err(_) => adb.execute(&["shell", "dumpsys", "activity", "recents"]).await?,
                    };
                    for line in out.lines() {
                        let trimmed = line.trim();
                        if trimmed.starts_with("topResumedActivity") || trimmed.starts_with("mResumedActivity") || trimmed.starts_with("ResumedActivity:") {
                            return Ok(json!({ "activity_line": trimmed.to_string() }));
                        }
                    }
                    // Last resort: parse the stack trace for the focused activity
                    for line in out.lines() {
                        let trimmed = line.trim();
                        if trimmed.contains("FocusedActivity:") || trimmed.contains("focusedApp=") {
                            return Ok(json!({ "activity_line": trimmed.to_string() }));
                        }
                    }
                    Ok(json!({ "activity_line": "Unknown — could not determine foreground activity" }))
                }
                "grant_permission" => {
                    let serial = self.get_serial(&args)?;
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    let perm = args["permission"].as_str().ok_or("Missing permission")?;
                    if pkg.is_empty() { return Err("Package name must not be empty".to_string()); }
                    if perm.is_empty() { return Err("Permission name must not be empty".to_string()); }
                    adb.with_device(&serial).execute(&["shell", "pm", "grant", pkg, perm]).await
                        .map_err(|e| format!("Failed to grant {} to {}: {}", perm, pkg, e))?;
                    Ok(json!({ "success": true }))
                }
                "revoke_permission" => {
                    let serial = self.get_serial(&args)?;
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    let perm = args["permission"].as_str().ok_or("Missing permission")?;
                    if pkg.is_empty() { return Err("Package name must not be empty".to_string()); }
                    if perm.is_empty() { return Err("Permission name must not be empty".to_string()); }
                    adb.with_device(&serial).execute(&["shell", "pm", "revoke", pkg, perm]).await
                        .map_err(|e| format!("Failed to revoke {} from {}: {}", perm, pkg, e))?;
                    Ok(json!({ "success": true }))
                }
                "handle_dialog" => {
                    let serial = self.get_serial(&args)?;
                    let action = args["action"].as_str().unwrap_or("accept");
                    let selectors: Vec<&str> = if action == "accept" {
                        vec!["Allow", "While using the app", "Only this time", "OK", "Yes", "Accept", "Allow always", "Agree", "Continue"]
                    } else {
                        vec!["Don't allow", "Deny", "Cancel", "No", "Dismiss", "Deny always", "Skip", "Not now"]
                    };
                    let (socket, sess_w, sess_h) = match self.state.get_session_info(&serial) {
                        Ok(info) => info,
                        Err(_) => return Err("No mirror session for this device. Call connect_device first.".to_string()),
                    };
                    for sel in &selectors {
                        if let Ok((x, y, _el)) = self.ui_extractor.resolve_selector(&adb, &serial, sel).await {
                            let tree = self.ui_extractor.get_tree(&adb, &serial, false, false).await.ok();
                            let (dw, dh) = tree.map(|t| (t.screen_width.max(1), t.screen_height.max(1))).unwrap_or((sess_w.max(1), sess_h.max(1)));
                            let tx = (x as u32).min(dw.saturating_sub(1));
                            let ty = (y as u32).min(dh.saturating_sub(1));
                            control::inject_touch(&socket, "down", tx, ty, dw as u16, dh as u16).await.map_err(|e| format!("Touch down failed: {}", e))?;
                            sleep(Duration::from_millis(50)).await;
                            let _ = control::inject_touch(&socket, "up", tx, ty, dw as u16, dh as u16).await;
                            return Ok(json!({ "handled": true, "clicked_button": sel }));
                        }
                    }
                    Ok(json!({ "handled": false, "reason": "No matching dialog buttons found. The dialog text may not match known labels, or no dialog is visible." }))
                }
                "get_logcat" => {
                    let serial = self.get_serial(&args)?;
                    let lines = args["lines"].as_u64().unwrap_or(100).clamp(1, 5000);
                    let lines_str = lines.to_string();
                    
                    let mut pid_str = String::new();
                    if let Some(pkg) = args.get("package_filter").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                        let out = adb.with_device(&serial).execute(&["shell", "pidof", pkg]).await.unwrap_or_default();
                        let pid = out.trim();
                        if !pid.is_empty() {
                            pid_str = pid.to_string();
                        }
                    }

                    let mut cmd_args = vec!["shell", "logcat", "-d", "-t", &lines_str];
                    if !pid_str.is_empty() {
                        cmd_args.push("--pid");
                        cmd_args.push(&pid_str);
                    }
                    if let Some(tag) = args.get("tag_filter").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
                        cmd_args.push("-s");
                        cmd_args.push(tag);
                    }
                    let out = adb.with_device(&serial).execute(&cmd_args).await?;
                    Ok(json!({ "logs": out }))
                }
                "run_script" => {
                    let serial = self.get_serial(&args)?;
                    let steps_val = args["steps"].clone();
                    if !steps_val.is_array() {
                        return Err("'steps' must be an array".to_string());
                    }
                    let steps_arr = steps_val.as_array().unwrap();
                    if steps_arr.is_empty() {
                        return Err("'steps' array must not be empty".to_string());
                    }
                    if steps_arr.len() > 50 {
                        return Err(format!("Too many steps ({}). Max is 50.", steps_arr.len()));
                    }
                    let steps: Vec<ScriptStep> = serde_json::from_value(steps_val).map_err(|e| format!("Invalid script steps: {}", e))?;
                    let mut results = Vec::new();
                    for (i, step) in steps.iter().enumerate() {
                        let step_args = serde_json::to_value(step.clone()).unwrap_or(json!({}));
                        let step_args = match step_args {
                            Value::Object(mut m) => {
                                m.insert("serial".to_string(), Value::String(serial.to_string()));
                                // Swipe/drag handlers expect start_x/start_y, but ScriptStep uses x/y
                                if step.action == "swipe" || step.action == "drag" {
                                    if let Some(v) = m.remove("x") { m.insert("start_x".to_string(), v); }
                                    if let Some(v) = m.remove("y") { m.insert("start_y".to_string(), v); }
                                }
                                Value::Object(m)
                            },
                            _ => step_args
                        };

                        match step.action.as_str() {
                            "tap" | "long_press" | "swipe" | "drag" | "type_text" | "press_key" => {
                                match self.call_tool(step.action.as_str(), step_args).await {
                                    Ok(_) => results.push(json!({ "step": i + 1, "action": step.action, "success": true })),
                                    Err(e) => return Err(format!("Step {} failed: {}", i + 1, e)),
                                }
                            }
                            "sleep" => {
                                let dur = step.duration_ms.unwrap_or(1000).min(10000);
                                sleep(Duration::from_millis(dur)).await;
                                results.push(json!({ "step": i + 1, "action": "sleep", "duration_ms": dur }));
                            }
                            _ => return Err(format!("Step {}: unsupported action '{}'", i + 1, step.action)),
                        }
                        sleep(Duration::from_millis(150)).await;
                    }
                    Ok(json!({ "success": true, "step_results": results }))
                }
                _ => Err(format!("Unknown tool: {}", name)),
            }
        })
    }

    async fn resolve_abs_coords(&self, adb: &Adb, serial: &str, args: &Value, w: u32, h: u32) -> Result<(u32, u32, u32, u32), String> {
        let (x, y, display_w, display_h) = if let Some(sel) = args["selector"].as_str() {
            let (cx, cy, _) = self.ui_extractor.resolve_selector(adb, serial, sel).await?;
            let tree = self.ui_extractor.get_tree(adb, serial, false, false).await?;
            let dw = tree.screen_width.max(1);
            let dh = tree.screen_height.max(1);
            (cx as f32, cy as f32, dw, dh)
        } else if let (Some(xv), Some(yv)) = (args["x"].as_f64(), args["y"].as_f64()) {
            let mode = args.get("coordinate_mode").and_then(|v| v.as_str()).unwrap_or("absolute");
            if mode == "normalized" {
                ((xv as f32 * w as f32).round(), (yv as f32 * h as f32).round(), w.max(1), h.max(1))
            } else {
                (xv as f32, yv as f32, w.max(1), h.max(1))
            }
        } else {
            return Err("Must provide either 'selector' or both 'x' and 'y' coordinates".to_string());
        };

        let clamp = |v: f32, max: u32| -> u32 {
            let rounded = v.round() as u32;
            if max == 0 { 0 } else if rounded >= max { max - 1 } else { rounded }
        };

        Ok((clamp(x, display_w), clamp(y, display_h), display_w, display_h))
    }
}

/// Parse clipboard text from `service call clipboard 4` hex-dump Parcel output.
///
/// The service call outputs a hex dump of the raw Parcel. The clipboard text
/// is stored as a 4-byte little-endian length followed by UTF-8 text somewhere
/// in the Parcel (after the "text/plain" MIME section).
fn parse_clipboard_parcel(output: &str) -> Option<String> {
    let mut bytes: Vec<u8> = Vec::new();

    for line in output.lines() {
        let line = line.trim();
        // Skip non-hex lines
        let hex_part = if let Some(pos) = line.find(':') {
            &line[pos + 1..]
        } else {
            continue;
        };
        let hex_part = hex_part.split('\'').next().unwrap_or(hex_part);
        for word in hex_part.split_whitespace() {
            if word.len() == 8 && word.chars().all(|c| c.is_ascii_hexdigit()) {
                if let Ok(v) = u32::from_str_radix(word, 16) {
                    // Convert LE 32-bit hex word to bytes in memory order
                    bytes.extend_from_slice(&v.to_le_bytes());
                }
            }
        }
    }

    if bytes.is_empty() {
        return None;
    }

    // Find the "text/plain" MIME in UTF-16LE
    let mime: &[u8] = &[
        b't', 0, b'e', 0, b'x', 0, b't', 0, b'/', 0, b'p', 0, b'l', 0, b'a', 0, b'i', 0, b'n', 0,
    ];
    let search_start = bytes
        .windows(mime.len())
        .position(|w| w == mime)
        .map(|p| p + mime.len())
        .unwrap_or(0);

    // Scan for a length-prefixed UTF-8 string (most likely the clipboard text)
    let mut best: Option<String> = None;
    let mut best_len = 0usize;
    let mut i = search_start;
    while i + 4 < bytes.len() {
        let len = u32::from_le_bytes([bytes[i], bytes[i + 1], bytes[i + 2], bytes[i + 3]]) as usize;
        if (1..100000).contains(&len) && i + 4 + len <= bytes.len() {
            let candidate = &bytes[i + 4..i + 4 + len];
            if let Ok(s) = String::from_utf8(candidate.to_vec()) {
                let printable = s.chars().filter(|c| c.is_ascii_graphic() || c.is_ascii_whitespace()).count();
                if printable > len / 2 && len > best_len {
                    best_len = len;
                    best = Some(s);
                }
            }
        }
        i += 4;
    }

    best
}
