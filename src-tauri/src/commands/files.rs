use serde::{Deserialize, Serialize};
use crate::adb::Adb;
use crate::utils;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: String,
    pub modified_at: String,
    pub permissions: String,
}

#[tauri::command]
pub async fn list_files(app: tauri::AppHandle, device_id: String, path: String) -> Result<Vec<FileInfo>, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    
    // ls -al returns hidden files too. We add a trailing slash to path just in case, but adb handles it.
    let output = adb.execute(&["shell", "ls", "-al", &path]).await?;
    
    let mut files = Vec::new();
    
    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with("total ") {
            continue;
        }

        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() < 6 {
            continue;
        }

        let permissions = parts[0].to_string();
        let is_dir = permissions.starts_with('d') || permissions.starts_with('l'); // Treating symlinks as dirs for navigation mostly, or we could handle them specially.
        
        // Find the index of the time element (usually contains a colon like 12:34 or is a year like 2023)
        // Usually the format is:
        // drwxrwx--- root everybody 4096 2023-11-20 12:34 Download
        // Parts length varies based on whether links count is present.
        
        let mut time_idx = 0;
        for (i, p) in parts.iter().enumerate().skip(4) {
            if p.contains(':') || p.len() == 4 && p.chars().all(char::is_numeric) {
                time_idx = i;
                break;
            }
        }
        
        if time_idx == 0 || time_idx + 1 >= parts.len() {
            // Fallback if we can't parse correctly, just assume filename is the last part
            let name = parts.last().unwrap().to_string();
            if name == "." || name == ".." { continue; }
            files.push(FileInfo {
                name,
                is_dir,
                size: "".to_string(),
                modified_at: "".to_string(),
                permissions,
            });
            continue;
        }

        let date_idx = time_idx - 1;
        let size_idx = date_idx - 1;
        
        let size = if is_dir { "".to_string() } else { parts[size_idx].to_string() };
        let modified_at = format!("{} {}", parts[date_idx], parts[time_idx]);
        
        // Name is everything after time_idx
        let name_parts = &parts[time_idx + 1..];
        let mut name = name_parts.join(" ");
        
        // If it's a symlink, name will be like "sdcard -> /storage/emulated/0"
        if permissions.starts_with('l') && name.contains(" -> ") {
            if let Some(real_name) = name.split(" -> ").next() {
                name = real_name.to_string();
            }
        }
        
        if name == "." || name == ".." {
            continue;
        }

        files.push(FileInfo {
            name,
            is_dir,
            size,
            modified_at,
            permissions,
        });
    }
    
    // Sort directories first, then files, alphabetically
    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(files)
}

#[tauri::command]
pub async fn pull_file(app: tauri::AppHandle, device_id: String, remote_path: String, local_path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["pull", &remote_path, &local_path]).await?;
    Ok(())
}

#[tauri::command]
pub async fn push_file(app: tauri::AppHandle, device_id: String, local_path: String, remote_path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["push", &local_path, &remote_path]).await?;
    Ok(())
}

#[tauri::command]
pub async fn delete_file(app: tauri::AppHandle, device_id: String, path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "rm", "-rf", &path]).await?;
    Ok(())
}

#[tauri::command]
pub async fn create_directory(app: tauri::AppHandle, device_id: String, path: String) -> Result<(), String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "mkdir", "-p", &path]).await?;
    Ok(())
}
