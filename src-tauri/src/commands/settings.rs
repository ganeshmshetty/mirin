use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub resolution: String,
    pub bitrate: u32,
    #[serde(rename = "maxFps")]
    pub max_fps: u32,
    #[serde(rename = "alwaysOnTop")]
    pub always_on_top: bool,
    #[serde(rename = "stayAwake")]
    pub stay_awake: bool,
    #[serde(rename = "turnScreenOff")]
    pub turn_screen_off: bool,
    pub theme: String,
    
    // MCP Settings
    #[serde(rename = "mcpEnabled")]
    pub mcp_enabled: bool,
    #[serde(rename = "mcpPort")]
    pub mcp_port: u16,
    #[serde(rename = "mcpRequireAuth")]
    pub mcp_require_auth: bool,
    #[serde(rename = "mcpLogLevel")]
    pub mcp_log_level: String,
}

impl Default for Settings {
    fn default() -> Self {
        Settings {
            resolution: "default".to_string(),
            bitrate: 8_000_000,
            max_fps: 60,
            always_on_top: false,
            stay_awake: true,
            turn_screen_off: false,
            theme: "system".to_string(),
            mcp_enabled: true,
            mcp_port: 48484,
            mcp_require_auth: true,
            mcp_log_level: "info".to_string(),
        }
    }
}

fn get_settings_path(app_handle: tauri::AppHandle) -> Result<PathBuf, String> {
    app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))
        .map(|mut path| {
            path.push("settings.json");
            path
        })
}

#[tauri::command]
pub async fn save_settings(
    settings: Settings,
    app_handle: tauri::AppHandle,
) -> Result<bool, String> {
    let settings_path = get_settings_path(app_handle)?;

    // Create parent directory if it doesn't exist
    if let Some(parent) = settings_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|e| format!("Failed to create settings directory: {}", e))?;
    }

    // Serialize and save settings
    let json = serde_json::to_string_pretty(&settings)
        .map_err(|e| format!("Failed to serialize settings: {}", e))?;

    fs::write(&settings_path, json)
        .map_err(|e| format!("Failed to write settings file: {}", e))?;

    Ok(true)
}

#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<Settings, String> {
    let settings_path = get_settings_path(app_handle)?;

    // If settings file doesn't exist, return default settings
    if !settings_path.exists() {
        return Ok(Settings::default());
    }

    // Read and deserialize settings
    let json = fs::read_to_string(&settings_path)
        .map_err(|e| format!("Failed to read settings file: {}", e))?;

    let settings: Settings = serde_json::from_str(&json)
        .map_err(|e| format!("Failed to parse settings: {}", e))?;

    Ok(settings)
}
