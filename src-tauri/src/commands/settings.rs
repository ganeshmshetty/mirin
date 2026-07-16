use std::fs;
use std::path::{Path, PathBuf};
use tauri::Manager;
pub use mirin_core::settings::Settings;

fn get_settings_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
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
    let settings_path = get_settings_path(&app_handle)?;
    mirin_core::settings::save_settings_impl(settings, settings_path)
}

#[tauri::command]
pub async fn load_settings(app_handle: tauri::AppHandle) -> Result<Settings, String> {
    let settings_path = get_settings_path(&app_handle)?;
    mirin_core::settings::load_settings_impl(settings_path)
}

/// Recursively measure size of a path (best-effort).
fn dir_size(path: &Path) -> u64 {
    if path.is_file() {
        return path.metadata().map(|m| m.len()).unwrap_or(0);
    }
    let mut total = 0u64;
    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_dir() {
                total = total.saturating_add(dir_size(&p));
            } else {
                total = total.saturating_add(entry.metadata().map(|m| m.len()).unwrap_or(0));
            }
        }
    }
    total
}

/// Remove a file or directory tree. Returns bytes freed (pre-delete size) or error.
fn remove_path(path: &Path) -> Result<u64, String> {
    if !path.exists() {
        return Ok(0);
    }
    let size = dir_size(path);
    if path.is_dir() {
        fs::remove_dir_all(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    } else {
        fs::remove_file(path).map_err(|e| format!("{}: {}", path.display(), e))?;
    }
    Ok(size)
}

/// Clear children of a directory (keeps the directory itself). Best-effort for locked files.
fn clear_directory_contents(dir: &Path) -> (u64, u32, Vec<String>) {
    let mut bytes = 0u64;
    let mut count = 0u32;
    let mut errors = Vec::new();

    if !dir.is_dir() {
        return (0, 0, errors);
    }

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            match remove_path(&path) {
                Ok(n) => {
                    if n > 0 || !path.exists() {
                        bytes = bytes.saturating_add(n);
                        count += 1;
                    }
                }
                Err(e) => {
                    // Try clearing children if top-level remove fails (e.g. WebKit lock).
                    if path.is_dir() {
                        let (b, c, child_errs) = clear_directory_contents(&path);
                        bytes = bytes.saturating_add(b);
                        count += c;
                        errors.extend(child_errs);
                        // Attempt remove again after emptying
                        let _ = fs::remove_dir(&path);
                    } else {
                        errors.push(e);
                    }
                }
            }
        }
    }

    (bytes, count, errors)
}

fn format_bytes(bytes: u64) -> String {
    const KB: f64 = 1024.0;
    const MB: f64 = KB * 1024.0;
    const GB: f64 = MB * 1024.0;
    let b = bytes as f64;
    if b >= GB {
        format!("{:.1} GB", b / GB)
    } else if b >= MB {
        format!("{:.1} MB", b / MB)
    } else if b >= KB {
        format!("{:.1} KB", b / KB)
    } else {
        format!("{} B", bytes)
    }
}

/// Clear disposable app cache (WebKit, system cache dirs, temp logs).
/// Does **not** delete settings.json or saved devices.
#[tauri::command]
pub async fn clear_app_cache(app_handle: tauri::AppHandle) -> Result<String, String> {
    let mut total_bytes = 0u64;
    let mut total_items = 0u32;
    let mut targets_cleared = Vec::new();
    let mut errors = Vec::new();

    // 1) Primary: Tauri app cache dir (~/Library/Caches/com.mirin.gui on macOS)
    if let Ok(cache_dir) = app_handle.path().app_cache_dir() {
        if cache_dir.exists() {
            let (b, c, errs) = clear_directory_contents(&cache_dir);
            total_bytes = total_bytes.saturating_add(b);
            total_items += c;
            errors.extend(errs);
            if c > 0 || b > 0 {
                targets_cleared.push(format!("app cache ({})", cache_dir.display()));
            }
        }
    }

    // 2) App log dir if present
    if let Ok(log_dir) = app_handle.path().app_log_dir() {
        if log_dir.exists() {
            let (b, c, errs) = clear_directory_contents(&log_dir);
            total_bytes = total_bytes.saturating_add(b);
            total_items += c;
            errors.extend(errs);
            if c > 0 || b > 0 {
                targets_cleared.push("app logs".into());
            }
        }
    }

    // 3) Disposable folders under app data (never touch settings.json)
    if let Ok(app_data) = app_handle.path().app_data_dir() {
        const DISPOSABLE: &[&str] = &[
            "cache",
            "tmp",
            "logs",
            "screenshots_cache",
            "WebKit",
            "GPUCache",
            "Code Cache",
            "GPUCache",
            "blob_storage",
        ];
        for name in DISPOSABLE {
            let dir = app_data.join(name);
            if dir.exists() {
                match remove_path(&dir) {
                    Ok(n) => {
                        total_bytes = total_bytes.saturating_add(n);
                        total_items += 1;
                        targets_cleared.push(name.to_string());
                    }
                    Err(e) => {
                        // Locked dir: clear contents best-effort
                        let (b, c, errs) = clear_directory_contents(&dir);
                        total_bytes = total_bytes.saturating_add(b);
                        total_items += c;
                        if c == 0 {
                            errors.push(e);
                        }
                        errors.extend(errs);
                    }
                }
            }
        }
    }

    // 4) Legacy cache path (~/Library/Caches/mirin) used by older builds / productName
    if let Some(home_cache) = dirs::cache_dir() {
        for name in ["mirin", "Mirin"] {
            let legacy = home_cache.join(name);
            if legacy.exists() {
                let (b, c, errs) = clear_directory_contents(&legacy);
                total_bytes = total_bytes.saturating_add(b);
                total_items += c;
                errors.extend(errs);
                if c > 0 || b > 0 {
                    targets_cleared.push(format!("legacy cache ({name})"));
                }
            }
        }
    }

    // 5) System temp: mirin_* files and MCP auth token
    let tmp = std::env::temp_dir();
    let token = tmp.join("mirin_mcp_auth.token");
    if token.exists() {
        match remove_path(&token) {
            Ok(n) => {
                total_bytes = total_bytes.saturating_add(n);
                total_items += 1;
                targets_cleared.push("MCP auth token".into());
            }
            Err(e) => errors.push(e),
        }
    }
    if let Ok(entries) = fs::read_dir(&tmp) {
        for entry in entries.flatten() {
            let name = entry.file_name();
            let name = name.to_string_lossy();
            // Only clear our own temp artifacts, not unrelated "mirin*" projects
            let is_ours = name.starts_with("mirin_")
                || name.starts_with("mirin-")
                || name.starts_with(".mirin")
                || name == "mirin_crash.log"
                || name == "mirin_debug.log"
                || name == "mirin_screenshot.png";
            if is_ours {
                match remove_path(&entry.path()) {
                    Ok(n) => {
                        total_bytes = total_bytes.saturating_add(n);
                        total_items += 1;
                    }
                    Err(e) => errors.push(e),
                }
            }
        }
        if total_items > 0 && !targets_cleared.iter().any(|t| t.contains("temp")) {
            targets_cleared.push("temp files".into());
        }
    }

    // Deduplicate target labels for the message
    targets_cleared.sort();
    targets_cleared.dedup();

    if total_items == 0 && total_bytes == 0 {
        if !errors.is_empty() {
            return Err("Could not clear cache — some files are in use. Try again after closing popups.".into());
        }
        return Ok("Cache is already empty".into());
    }

    // Keep message short for toast UI
    let mut msg = format!("Cleared {}", format_bytes(total_bytes));
    if total_items > 0 {
        msg.push_str(&format!(" · {} item(s)", total_items));
    }
    if !errors.is_empty() {
        msg.push_str(" · some files skipped");
    }

    Ok(msg)
}
