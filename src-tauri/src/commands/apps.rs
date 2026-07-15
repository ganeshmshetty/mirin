use serde::{Deserialize, Serialize};
use crate::adb::Adb;
use crate::utils;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub package_name: String,
    pub is_system: bool,
}

#[tauri::command]
pub async fn list_apps(app: tauri::AppHandle, device_id: String) -> Result<Vec<AppInfo>, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    
    // We can get all packages, or just third party. Let's get all, and we'll figure out system vs 3rd party.
    let output = adb.execute(&["shell", "pm", "list", "packages", "-3"]).await?; 
    let mut apps = Vec::new();
    for line in output.lines() {
        if let Some(pkg) = line.strip_prefix("package:") {
            apps.push(AppInfo { 
                package_name: pkg.trim().to_string(),
                is_system: false, // We used -3, so they are not system apps
            });
        }
    }
    apps.sort_by(|a, b| a.package_name.cmp(&b.package_name));
    Ok(apps)
}

#[tauri::command]
pub async fn install_app(app: tauri::AppHandle, device_id: String, apk_path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    // Use -r to replace existing application
    adb.execute(&["install", "-r", &apk_path]).await?;
    Ok(())
}

#[tauri::command]
pub async fn uninstall_app(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["uninstall", &package_name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn launch_app(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    // Monkey command is an easy way to launch default activity of a package
    adb.execute(&["shell", "monkey", "-p", &package_name, "-c", "android.intent.category.LAUNCHER", "1"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn clear_app_data(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "pm", "clear", &package_name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn stop_app(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "am", "force-stop", &package_name]).await?;
    Ok(())
}
