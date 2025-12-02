use std::path::PathBuf;
use tauri::Manager;

/// Get the base resource path, with fallback for development mode
fn get_resource_base_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    // First, try the standard resource directory (for production builds)
    if let Ok(resource_path) = app.path().resource_dir() {
        let prod_path = resource_path.join("resources");
        if prod_path.exists() {
            return Ok(prod_path);
        }
    }
    
    // Fallback for development mode: use src-tauri/resources
    let dev_path = std::env::current_exe()
        .map_err(|e| format!("Failed to get current exe path: {}", e))?
        .parent()
        .ok_or_else(|| "Failed to get parent directory".to_string())?
        .join("..").join("..").join("..").join("resources");
    
    if dev_path.exists() {
        return Ok(dev_path.canonicalize().map_err(|e| format!("Failed to canonicalize path: {}", e))?);
    }
    
    // Another fallback: check relative to manifest dir (Cargo.toml location)
    let manifest_path = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    if manifest_path.exists() {
        return Ok(manifest_path);
    }
    
    Err("Could not find resources directory".to_string())
}

/// Get the path to the bundled ADB executable
pub fn get_adb_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_path = get_resource_base_path(app)?;
    
    let adb_path = resource_path.join("adb").join("adb.exe");
    
    if !adb_path.exists() {
        return Err(format!("ADB executable not found at: {:?}", adb_path));
    }
    
    Ok(adb_path)
}

/// Get the path to the bundled scrcpy executable
pub fn get_scrcpy_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_path = get_resource_base_path(app)?;
    
    let scrcpy_path = resource_path.join("scrcpy").join("scrcpy.exe");
    
    if !scrcpy_path.exists() {
        return Err(format!("Scrcpy executable not found at: {:?}", scrcpy_path));
    }
    
    Ok(scrcpy_path)
}

/// Get the path to the scrcpy-server file
#[allow(dead_code)]
pub fn get_scrcpy_server_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_path = get_resource_base_path(app)?;
    
    let server_path = resource_path.join("scrcpy").join("scrcpy-server");
    
    if !server_path.exists() {
        return Err(format!("Scrcpy server not found at: {:?}", server_path));
    }
    
    Ok(server_path)
}

/// Get the directory containing ADB executables and libraries
pub fn get_adb_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_path = get_resource_base_path(app)?;
    
    let adb_dir = resource_path.join("adb");
    
    if !adb_dir.exists() {
        return Err(format!("ADB directory not found at: {:?}", adb_dir));
    }
    
    Ok(adb_dir)
}

/// Get the directory containing scrcpy executables and libraries
pub fn get_scrcpy_dir(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let resource_path = get_resource_base_path(app)?;
    
    let scrcpy_dir = resource_path.join("scrcpy");
    
    if !scrcpy_dir.exists() {
        return Err(format!("Scrcpy directory not found at: {:?}", scrcpy_dir));
    }
    
    Ok(scrcpy_dir)
}

#[cfg(test)]
mod tests {
    use super::*;

    // Note: These tests require a Tauri app instance and are mainly for documentation
    // Real testing should be done in integration tests or manually
}
