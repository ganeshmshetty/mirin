pub use mirin_core::apps::AppInfo;
use crate::utils;

#[tauri::command]
pub async fn list_apps(app: tauri::AppHandle, device_id: String) -> Result<Vec<AppInfo>, String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::apps::list_apps_impl(adb_path, device_id).await
}

#[tauri::command]
pub async fn install_app(app: tauri::AppHandle, device_id: String, apk_path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::apps::install_app_impl(adb_path, device_id, apk_path).await
}

#[tauri::command]
pub async fn uninstall_app(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::apps::uninstall_app_impl(adb_path, device_id, package_name).await
}

#[tauri::command]
pub async fn launch_app(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::apps::launch_app_impl(adb_path, device_id, package_name).await
}

#[tauri::command]
pub async fn clear_app_data(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::apps::clear_app_data_impl(adb_path, device_id, package_name).await
}

#[tauri::command]
pub async fn stop_app(app: tauri::AppHandle, device_id: String, package_name: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::apps::stop_app_impl(adb_path, device_id, package_name).await
}
