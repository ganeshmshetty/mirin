use anyhow::Result;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Arc;
use std::time::Duration;
use tauri::AppHandle;
use tokio::time::sleep;
use crate::adb::Adb;
use crate::commands;
use crate::mcp::screenshot::ScreenshotRegistry;
use crate::mcp::ui_extractor::UiExtractor;
use crate::scrcpy::{control, EmbeddedScrcpyState};

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

#[derive(Clone)]
pub struct ToolDispatcher {
    app: AppHandle,
    state: EmbeddedScrcpyState,
    pub ui_extractor: UiExtractor,
    pub screenshot_registry: ScreenshotRegistry,
}

impl ToolDispatcher {
    pub fn new(
        app: AppHandle,
        state: EmbeddedScrcpyState,
        ui_extractor: UiExtractor,
        screenshot_registry: ScreenshotRegistry,
    ) -> Self {
        Self {
            app,
            state,
            ui_extractor,
            screenshot_registry,
        }
    }

    pub fn get_tools_list() -> Vec<Value> {
        vec![
            json!({
                "name": "list_devices",
                "description": "Get a list of all connected Android devices (USB and Wireless) with status and connection type.",
                "inputSchema": { "type": "object", "properties": {} }
            }),
            json!({
                "name": "connect_device",
                "description": "Ensure an embedded scrcpy mirroring session is running and ready for control commands. Reuses existing session if already active.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "serial": { "type": "string" } },
                    "required": ["serial"]
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
                    },
                    "required": ["serial"]
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
                    },
                    "required": ["serial"]
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
                    "required": ["serial", "selector"]
                }
            }),
            json!({
                "name": "tap",
                "description": "Tap on a UI element (by selector) or exact normalized/absolute coordinates.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string" },
                        "x": { "type": "number" },
                        "y": { "type": "number" }
                    },
                    "required": ["serial"]
                }
            }),
            json!({
                "name": "long_press",
                "description": "Long press on a UI element or coordinates for specified duration (default 800ms).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string" },
                        "x": { "type": "number" },
                        "y": { "type": "number" },
                        "duration_ms": { "type": "integer", "default": 800 }
                    },
                    "required": ["serial"]
                }
            }),
            json!({
                "name": "swipe",
                "description": "Swipe across the screen from start coordinates to end coordinates.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "start_x": { "type": "number" },
                        "start_y": { "type": "number" },
                        "end_x": { "type": "number" },
                        "end_y": { "type": "number" },
                        "duration_ms": { "type": "integer", "default": 300 }
                    },
                    "required": ["serial", "start_x", "start_y", "end_x", "end_y"]
                }
            }),
            json!({
                "name": "drag",
                "description": "Drag from start coordinates to end coordinates (slower swipe with initial hold).",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "start_x": { "type": "number" },
                        "start_y": { "type": "number" },
                        "end_x": { "type": "number" },
                        "end_y": { "type": "number" },
                        "duration_ms": { "type": "integer", "default": 800 }
                    },
                    "required": ["serial", "start_x", "start_y", "end_x", "end_y"]
                }
            }),
            json!({
                "name": "scroll_to",
                "description": "Automatically scroll up or down until a specific element selector becomes visible.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "selector": { "type": "string" },
                        "direction": { "type": "string", "enum": ["up", "down"], "default": "down" },
                        "max_swipes": { "type": "integer", "default": 5 }
                    },
                    "required": ["serial", "selector"]
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
                    "required": ["serial", "text"]
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
                    "required": ["serial", "keycode"]
                }
            }),
            json!({
                "name": "hide_keyboard",
                "description": "Hide the on-screen keyboard by sending BACK key when keyboard is open.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "serial": { "type": "string" } },
                    "required": ["serial"]
                }
            }),
            json!({
                "name": "clipboard",
                "description": "Get or set device clipboard text.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "action": { "type": "string", "enum": ["get", "set"] },
                        "text": { "type": "string" }
                    },
                    "required": ["serial", "action"]
                }
            }),
            json!({
                "name": "set_orientation",
                "description": "Set device rotation orientation.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "orientation": { "type": "string", "enum": ["portrait", "landscape"] }
                    },
                    "required": ["serial", "orientation"]
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
                    },
                    "required": ["serial"]
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
                    "required": ["serial", "package"]
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
                    "required": ["serial", "package"]
                }
            }),
            json!({
                "name": "get_current_activity",
                "description": "Get the top resumed activity / package currently on screen.",
                "inputSchema": {
                    "type": "object",
                    "properties": { "serial": { "type": "string" } },
                    "required": ["serial"]
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
                    "required": ["serial", "package", "permission"]
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
                    "required": ["serial", "package", "permission"]
                }
            }),
            json!({
                "name": "handle_dialog",
                "description": "Automatically click accept/allow or dismiss/deny buttons on system or app dialogs.",
                "inputSchema": {
                    "type": "object",
                    "properties": {
                        "serial": { "type": "string" },
                        "action": { "type": "string", "enum": ["accept", "dismiss"], "default": "accept" }
                    },
                    "required": ["serial", "action"]
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
                    },
                    "required": ["serial"]
                }
            }),
            json!({
                "name": "run_script",
                "description": "Execute a multi-step sequence of actions, re-resolving selectors dynamically at each step.",
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
                    "required": ["serial", "steps"]
                }
            }),
        ]
    }

    pub fn call_tool<'a>(&'a self, name: &'a str, args: Value) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, String>> + Send + 'a>> {
        Box::pin(async move {
            let adb = Adb::new(crate::utils::get_adb_path(&self.app)?);

            match name {
                "list_devices" => {
                    let devices = commands::device::get_connected_devices(self.app.clone()).await?;
                    Ok(serde_json::to_value(devices).map_err(|e| e.to_string())?)
                }
                "connect_device" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?.to_string();
                    if let Ok((_sock, w, h)) = self.state.get_session_info(&serial) {
                        return Ok(json!({ "status": "already_connected", "width": w, "height": h }));
                    }

                    let scrcpy_server_path = crate::utils::get_scrcpy_server_path(&self.app)?;
                    let scrcpy_version = crate::scrcpy::get_version_number(&self.app);
                    let opts = crate::scrcpy::stream::EmbeddedStreamSettings::default();

                    let streams = crate::scrcpy::stream::start_server(&adb, &serial, &scrcpy_server_path, &scrcpy_version, &opts)
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

                    let session = crate::scrcpy::EmbeddedSessionInfo {
                        control_socket: Arc::new(tokio::sync::Mutex::new(streams.control_socket)),
                        shutdown_notify: shutdown,
                        screen_width: width,
                        screen_height: height,
                        port: streams.port,
                        server_process: streams.server_process,
                    };

                    self.state.add_session(serial.clone(), session)?;
                    Ok(json!({ "status": "connected", "width": width, "height": height }))
                }
                "get_screen" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let raw = args["raw"].as_bool().unwrap_or(false);
                    let tree = self.ui_extractor.get_tree(&adb, serial, raw, true).await?;
                    Ok(serde_json::to_value(tree).map_err(|e| e.to_string())?)
                }
                "get_screenshot" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let annotate = args["annotate"].as_bool().unwrap_or(false);
                    let res = self
                        .screenshot_registry
                        .capture(&self.app, &self.ui_extractor, serial, annotate)
                        .await?;
                    Ok(serde_json::to_value(res).map_err(|e| e.to_string())?)
                }
                "find_element" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let selector = args["selector"].as_str().ok_or("Missing selector")?;
                    let (x, y, el) = self.ui_extractor.resolve_selector(&adb, serial, selector).await?;
                    Ok(json!({ "center_x": x, "center_y": y, "element": el }))
                }
                "tap" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let (socket, w, h) = self.state.get_session_info(serial)?;
                    let (abs_x, abs_y) = self.resolve_abs_coords(&adb, serial, &args, w, h).await?;
                    control::inject_touch(&socket, "down", abs_x, abs_y, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                    sleep(Duration::from_millis(50)).await;
                    let _ = control::inject_touch(&socket, "up", abs_x, abs_y, w as u16, h as u16).await;
                    Ok(json!({ "success": true, "x": abs_x, "y": abs_y }))
                }
                "long_press" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let duration_ms = args["duration_ms"].as_u64().unwrap_or(800).min(5000);
                    let (socket, w, h) = self.state.get_session_info(serial)?;
                    let (abs_x, abs_y) = self.resolve_abs_coords(&adb, serial, &args, w, h).await?;
                    control::inject_touch(&socket, "down", abs_x, abs_y, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                    sleep(Duration::from_millis(duration_ms)).await;
                    let _ = control::inject_touch(&socket, "up", abs_x, abs_y, w as u16, h as u16).await;
                    Ok(json!({ "success": true }))
                }
                "swipe" | "drag" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let duration_ms = args["duration_ms"].as_u64().unwrap_or(if name == "drag" { 800 } else { 300 }).min(5000);
                    let is_normalized = args.get("coordinate_mode").and_then(|v| v.as_str()).unwrap_or("absolute") == "normalized";
                    let start_x = args["start_x"].as_f64().ok_or("Missing start_x")? as f32;
                    let start_y = args["start_y"].as_f64().ok_or("Missing start_y")? as f32;
                    let end_x = args["end_x"].as_f64().ok_or("Missing end_x")? as f32;
                    let end_y = args["end_y"].as_f64().ok_or("Missing end_y")? as f32;
                    let (socket, w, h) = self.state.get_session_info(serial)?;
                    
                    let parse_coord = |v: f32, max: u32| -> u32 {
                        let abs = if is_normalized { (v * max as f32).round() as u32 } else { v as u32 };
                        if max == 0 { 0 } else if abs >= max { max - 1 } else { abs }
                    };
                    let sx = parse_coord(start_x, w);
                    let sy = parse_coord(start_y, h);
                    let ex = parse_coord(end_x, w);
                    let ey = parse_coord(end_y, h);

                    control::inject_touch(&socket, "down", sx, sy, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                    
                    let res = async {
                        if name == "drag" {
                            sleep(Duration::from_millis(200)).await;
                        }
                        let steps = 15;
                        let step_delay = duration_ms / steps;
                        for i in 1..=steps {
                            let t = i as f32 / steps as f32;
                            let cx = (sx as f32 + (ex as f32 - sx as f32) * t).round() as u32;
                            let cy = (sy as f32 + (ey as f32 - sy as f32) * t).round() as u32;
                            control::inject_touch(&socket, "move", cx, cy, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                            sleep(Duration::from_millis(step_delay)).await;
                        }
                        Ok::<(), String>(())
                    }.await;
                    
                    let _ = control::inject_touch(&socket, "up", ex, ey, w as u16, h as u16).await;
                    res?;
                    Ok(json!({ "success": true }))
                }
                "scroll_to" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let selector = args["selector"].as_str().ok_or("Missing selector")?;
                    let direction = args["direction"].as_str().unwrap_or("down");
                    let max_swipes = args["max_swipes"].as_u64().unwrap_or(5).min(20);
                    let (socket, w, h) = self.state.get_session_info(serial)?;
                    let center_x = w / 2;
                    let start_y = if direction == "down" { h * 3 / 4 } else { h / 4 };
                    let end_y = if direction == "down" { h / 4 } else { h * 3 / 4 };
                    
                    for _ in 0..max_swipes {
                        if let Ok((x, y, _)) = self.ui_extractor.resolve_selector(&adb, serial, selector).await {
                            return Ok(json!({ "success": true, "found": true, "x": x, "y": y }));
                        }
                        control::inject_touch(&socket, "down", center_x, start_y, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                        let steps = 10;
                        for i in 1..=steps {
                            let t = i as f32 / steps as f32;
                            let cy = (start_y as f32 + (end_y as f32 - start_y as f32) * t).round() as u32;
                            control::inject_touch(&socket, "move", center_x, cy, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                            sleep(Duration::from_millis(15)).await;
                        }
                        control::inject_touch(&socket, "up", center_x, end_y, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                        sleep(Duration::from_millis(800)).await;
                    }
                    Ok(json!({ "success": true, "found": false }))
                }
                "type_text" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let text = args["text"].as_str().ok_or("Missing text")?;
                    let socket = self.state.get_control_socket(serial)?;
                    control::inject_text(&socket, text).await.map_err(|e| e.to_string())?;
                    Ok(json!({ "success": true }))
                }
                "press_key" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let keycode = args["keycode"].as_u64().ok_or("Missing keycode")? as u32;
                    let socket = self.state.get_control_socket(serial)?;
                    control::inject_keycode(&socket, "down", keycode, 0, 0).await.map_err(|e| e.to_string())?;
                    control::inject_keycode(&socket, "up", keycode, 0, 0).await.map_err(|e| e.to_string())?;
                    Ok(json!({ "success": true }))
                }
                "hide_keyboard" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let out = adb.execute(&["shell", "dumpsys", "input_method"]).await.unwrap_or_default();
                    if out.contains("mInputShown=true") {
                        let socket = self.state.get_control_socket(serial)?;
                        control::inject_keycode(&socket, "down", control::KEYCODE_BACK, 0, 0).await.map_err(|e| e.to_string())?;
                        control::inject_keycode(&socket, "up", control::KEYCODE_BACK, 0, 0).await.map_err(|e| e.to_string())?;
                    }
                    Ok(json!({ "success": true }))
                }
                "clipboard" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let action = args["action"].as_str().ok_or("Missing action")?;
                    if action == "set" {
                        let text = args["text"].as_str().ok_or("Missing text for clipboard set")?;
                        adb.execute(&["shell", "am", "broadcast", "-a", "clipper.set", "-e", "text", text]).await?;
                        adb.execute(&["shell", "service", "call", "clipboard", "2", "i32", "1", "s16", text]).await?;
                        Ok(json!({ "success": true }))
                    } else {
                        let out = adb.execute(&["shell", "service", "call", "clipboard", "1"]).await?;
                        Ok(json!({ "clipboard": out.trim() }))
                    }
                }
                "set_orientation" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let orient = args["orientation"].as_str().unwrap_or("portrait");
                    let val = if orient == "landscape" { "1" } else { "0" };
                    adb.execute(&["shell", "settings", "put", "system", "accelerometer_rotation", "0"]).await?;
                    adb.execute(&["shell", "settings", "put", "system", "user_rotation", val]).await?;
                    Ok(json!({ "success": true }))
                }
                "list_apps" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let third_party = args["third_party_only"].as_bool().unwrap_or(true);
                    let mut command = vec!["shell", "pm", "list", "packages"];
                    if third_party {
                        command.push("-3");
                    }
                    let out = adb.execute(&command).await?;
                    let packages: Vec<String> = out
                        .lines()
                        .filter_map(|l| l.trim().strip_prefix("package:").map(|s| s.to_string()))
                        .collect();
                    Ok(json!({ "packages": packages }))
                }
                "launch_app" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    if let Some(act) = args["activity"].as_str() {
                        let comp = format!("{}/{}", pkg, act);
                        adb.execute(&["shell", "am", "start", "-n", &comp]).await?;
                    } else {
                        // Resolve main activity cleanly without using monkey
                        let out = adb.execute(&["shell", "cmd", "package", "resolve-activity", "--brief", pkg]).await?;
                        let resolved = out.lines().last().unwrap_or("").trim();
                        if resolved.contains('/') && !resolved.contains("No activity found") {
                            adb.execute(&["shell", "am", "start", "-n", resolved]).await?;
                        } else {
                            return Err(format!("Could not resolve main launcher activity for package {}", pkg));
                        }
                    }
                    Ok(json!({ "success": true }))
                }
                "stop_app" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    adb.execute(&["shell", "am", "force-stop", pkg]).await?;
                    Ok(json!({ "success": true }))
                }
                "get_current_activity" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let out = adb.execute(&["shell", "dumpsys", "activity", "activities"]).await?;
                    for line in out.lines() {
                        if line.contains("topResumedActivity") || line.contains("mResumedActivity") {
                            return Ok(json!({ "activity_line": line.trim() }));
                        }
                    }
                    Ok(json!({ "activity_line": "Unknown" }))
                }
                "grant_permission" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    let perm = args["permission"].as_str().ok_or("Missing permission")?;
                    adb.execute(&["shell", "pm", "grant", pkg, perm]).await?;
                    Ok(json!({ "success": true }))
                }
                "revoke_permission" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let pkg = args["package"].as_str().ok_or("Missing package")?;
                    let perm = args["permission"].as_str().ok_or("Missing permission")?;
                    adb.execute(&["shell", "pm", "revoke", pkg, perm]).await?;
                    Ok(json!({ "success": true }))
                }
                "handle_dialog" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let action = args["action"].as_str().unwrap_or("accept");
                    let selectors = if action == "accept" {
                        vec!["Allow", "While using the app", "Only this time", "OK", "Yes", "Accept"]
                    } else {
                        vec!["Don't allow", "Deny", "Cancel", "No", "Dismiss"]
                    };
                    for sel in selectors {
                        if let Ok((x, y, _el)) = self.ui_extractor.resolve_selector(&adb, serial, sel).await {
                            if let Ok((socket, w, h)) = self.state.get_session_info(serial) {
                                control::inject_touch(&socket, "down", x as u32, y as u32, w as u16, h as u16).await.map_err(|e| e.to_string())?;
                                sleep(Duration::from_millis(50)).await;
                                let _ = control::inject_touch(&socket, "up", x as u32, y as u32, w as u16, h as u16).await;
                                return Ok(json!({ "handled": true, "clicked_button": sel }));
                            }
                        }
                    }
                    Ok(json!({ "handled": false, "reason": "No matching dialog buttons found" }))
                }
                "get_logcat" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let adb = adb.with_device(serial);
                    let lines = args["lines"].as_u64().unwrap_or(100).min(2000);
                    let lines_str = lines.to_string();
                    
                    let mut pid_str = String::new();
                    if let Some(pkg) = args["package_filter"].as_str() {
                        let pid_out = adb.execute(&["shell", "pidof", pkg]).await.unwrap_or_default();
                        let pid = pid_out.trim();
                        if !pid.is_empty() {
                            pid_str = pid.to_string();
                        }
                    }

                    let mut cmd_args = vec!["shell", "logcat", "-d", "-t", &lines_str];
                    if !pid_str.is_empty() {
                        cmd_args.push("--pid");
                        cmd_args.push(&pid_str);
                    }
                    if let Some(tag) = args["tag_filter"].as_str() {
                        cmd_args.push(tag);
                    }
                    let out = adb.execute(&cmd_args).await?;
                    Ok(json!({ "logs": out }))
                }
                "run_script" => {
                    let serial = args["serial"].as_str().ok_or("Missing serial")?;
                    let steps_val = args["steps"].clone();
                    let mut steps: Vec<ScriptStep> = serde_json::from_value(steps_val).map_err(|e| format!("Invalid script steps: {}", e))?;
                    steps.truncate(50);
                    let mut results = Vec::new();
                    for (i, step) in steps.iter().enumerate() {
                        let step_args = serde_json::to_value(step.clone()).unwrap_or(json!({}));
                        let step_args = match step_args {
                            Value::Object(mut m) => { m.insert("serial".to_string(), Value::String(serial.to_string())); Value::Object(m) },
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

    async fn resolve_abs_coords(&self, adb: &Adb, serial: &str, args: &Value, w: u32, h: u32) -> Result<(u32, u32), String> {
        let (x, y) = if let Some(sel) = args["selector"].as_str() {
            let (cx, cy, _) = self.ui_extractor.resolve_selector(adb, serial, sel).await?;
            (cx as f32, cy as f32)
        } else if let (Some(xv), Some(yv)) = (args["x"].as_f64(), args["y"].as_f64()) {
            let mode = args.get("coordinate_mode").and_then(|v| v.as_str()).unwrap_or("absolute");
            if mode == "normalized" {
                ((xv as f32 * w as f32).round(), (yv as f32 * h as f32).round())
            } else {
                (xv as f32, yv as f32)
            }
        } else {
            return Err("Must provide either 'selector' or both 'x' and 'y' coordinates".to_string());
        };
        
        let cx = x as u32;
        let cy = y as u32;
        let clamp_x = if w == 0 { 0 } else if cx >= w { w - 1 } else { cx };
        let clamp_y = if h == 0 { 0 } else if cy >= h { h - 1 } else { cy };
        
        Ok((clamp_x, clamp_y))
    }
}
