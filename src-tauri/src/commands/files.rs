pub use mirin_core::files::FileInfo;
use crate::utils;

#[tauri::command]
pub async fn list_files(app: tauri::AppHandle, device_id: String, path: String) -> Result<Vec<FileInfo>, String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::files::list_files_impl(adb_path, device_id, path).await
}

#[tauri::command]
pub async fn pull_file(app: tauri::AppHandle, device_id: String, remote_path: String, local_path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::files::pull_file_impl(adb_path, device_id, remote_path, local_path).await
}

#[tauri::command]
pub async fn push_file(app: tauri::AppHandle, device_id: String, local_path: String, remote_path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::files::push_file_impl(adb_path, device_id, local_path, remote_path).await
}

#[tauri::command]
pub async fn delete_file(app: tauri::AppHandle, device_id: String, path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::files::delete_file_impl(adb_path, device_id, path).await
}

#[tauri::command]
pub async fn create_directory(app: tauri::AppHandle, device_id: String, path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::files::create_directory_impl(adb_path, device_id, path).await
}
