use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

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

impl Settings {
    /// Clamp / normalize values so corrupt or out-of-range input cannot break the app.
    pub fn sanitize(mut self) -> Self {
        if self.bitrate == 0 || self.bitrate > 100_000_000 {
            self.bitrate = 8_000_000;
        }
        if self.max_fps == 0 || self.max_fps > 120 {
            self.max_fps = 60;
        }
        if self.mcp_port == 0 {
            self.mcp_port = 48484;
        }
        if self.resolution.trim().is_empty() {
            self.resolution = "default".to_string();
        }
        match self.theme.as_str() {
            "light" | "dark" | "system" => {}
            _ => self.theme = "system".to_string(),
        }
        match self.mcp_log_level.as_str() {
            "error" | "info" | "debug" => {}
            _ => self.mcp_log_level = "info".to_string(),
        }
        self
    }
}

pub fn save_settings_impl(settings: Settings, settings_path: PathBuf) -> Result<bool, String> {
    let settings = settings.sanitize();

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

pub fn load_settings_impl(settings_path: PathBuf) -> Result<Settings, String> {
    // If settings file doesn't exist, return default settings
    if !settings_path.exists() {
        return Ok(Settings::default());
    }

    // Read and deserialize settings
    let json = match fs::read_to_string(&settings_path) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("Failed to read settings file (using defaults): {}", e);
            return Ok(Settings::default());
        }
    };

    let settings = match serde_json::from_str::<Settings>(&json) {
        Ok(s) => s.sanitize(),
        Err(e) => {
            eprintln!("Corrupt settings.json (using defaults): {}", e);
            Settings::default()
        }
    };

    Ok(settings)
}
