use crate::adb::Adb;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileInfo {
    pub name: String,
    pub is_dir: bool,
    pub size: String,
    pub modified_at: String,
    pub permissions: String,
}

/// Reject empty paths and shell metacharacters that would break `adb shell` argument joining.
/// Spaces are allowed — the path is passed as a single argv token (not shell-quoted).
pub fn validate_device_path(path: &str) -> Result<(), String> {
    let path = path.trim();
    if path.is_empty() {
        return Err("Path must not be empty".to_string());
    }
    if path.len() > 1024 {
        return Err("Path is too long (max 1024 characters)".to_string());
    }
    // Characters that can alter shell parsing when adb joins shell args with spaces.
    const FORBIDDEN: &[char] = &[
        '`', '$', '|', ';', '&', '\n', '\r', '\0', '"', '\'', '<', '>', '(', ')', '{', '}',
    ];
    if path.chars().any(|c| FORBIDDEN.contains(&c)) {
        return Err(format!(
            "Path contains unsupported shell characters: '{}'",
            path
        ));
    }
    Ok(())
}

/// Collapse duplicate slashes and trim trailing slash (except root).
pub fn normalize_device_path(path: &str) -> String {
    let trimmed = path.trim();
    let mut out = String::with_capacity(trimmed.len());
    let mut prev_slash = false;
    for ch in trimmed.chars() {
        if ch == '/' {
            if !prev_slash {
                out.push('/');
            }
            prev_slash = true;
        } else {
            out.push(ch);
            prev_slash = false;
        }
    }
    if out.len() > 1 && out.ends_with('/') {
        out.pop();
    }
    if out.is_empty() {
        "/".to_string()
    } else {
        out
    }
}

pub async fn list_files_impl(
    adb_path: PathBuf,
    device_id: String,
    path: String,
) -> Result<Vec<FileInfo>, String> {
    let path = normalize_device_path(&path);
    validate_device_path(&path)?;
    let adb = Adb::new(adb_path).with_device(&device_id);

    // Pass path as a plain argv token — do NOT wrap in shell quotes (breaks adb shell join).
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
        // Treat symlinks as navigable directories (common for /sdcard etc.).
        let is_dir = permissions.starts_with('d') || permissions.starts_with('l');

        // Find the time/year token so filenames with spaces (and colons) parse correctly.
        // Format: drwxrwx--- 2 root everybody 4096 2023-11-20 12:34 Download
        let mut time_idx = 0;
        for (i, p) in parts.iter().enumerate().skip(4) {
            if p.contains(':') || (p.len() == 4 && p.chars().all(|c| c.is_ascii_digit())) {
                time_idx = i;
                break;
            }
        }

        if time_idx == 0 || time_idx + 1 >= parts.len() {
            let name = parts.last().unwrap().to_string();
            if name == "." || name == ".." {
                continue;
            }
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

        let size = if is_dir {
            "".to_string()
        } else {
            parts[size_idx].to_string()
        };
        let modified_at = format!("{} {}", parts[date_idx], parts[time_idx]);

        // Name is everything after the time token (preserves spaces in filenames).
        let name_parts = &parts[time_idx + 1..];
        let mut name = name_parts.join(" ");

        // Symlink: "name -> target"
        if permissions.starts_with('l') {
            if let Some((link_name, _)) = name.split_once(" -> ") {
                name = link_name.to_string();
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

    files.sort_by(|a, b| {
        if a.is_dir != b.is_dir {
            b.is_dir.cmp(&a.is_dir)
        } else {
            a.name.cmp(&b.name)
        }
    });

    Ok(files)
}

pub async fn pull_file_impl(
    adb_path: PathBuf,
    device_id: String,
    remote_path: String,
    local_path: String,
) -> Result<(), String> {
    let remote_path = normalize_device_path(&remote_path);
    validate_device_path(&remote_path)?;
    if local_path.trim().is_empty() {
        return Err("Local path must not be empty".to_string());
    }
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["pull", &remote_path, local_path.trim()])
        .await?;
    Ok(())
}

pub async fn push_file_impl(
    adb_path: PathBuf,
    device_id: String,
    local_path: String,
    remote_path: String,
) -> Result<(), String> {
    let remote_path = normalize_device_path(&remote_path);
    validate_device_path(&remote_path)?;
    if local_path.trim().is_empty() {
        return Err("Local path must not be empty".to_string());
    }
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["push", local_path.trim(), &remote_path])
        .await?;
    Ok(())
}

pub async fn delete_file_impl(
    adb_path: PathBuf,
    device_id: String,
    path: String,
) -> Result<(), String> {
    let path = normalize_device_path(&path);
    validate_device_path(&path)?;
    // Block accidental deletion of critical roots
    if path == "/" || path == "/system" || path == "/data" {
        return Err(format!("Refusing to delete protected path: '{}'", path));
    }
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "rm", "-rf", &path]).await?;
    Ok(())
}

pub async fn create_directory_impl(
    adb_path: PathBuf,
    device_id: String,
    path: String,
) -> Result<(), String> {
    let path = normalize_device_path(&path);
    validate_device_path(&path)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "mkdir", "-p", &path]).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_shell_metacharacters() {
        assert!(validate_device_path("").is_err());
        assert!(validate_device_path("/sdcard/$(rm)").is_err());
        assert!(validate_device_path("/sdcard/a;b").is_err());
        assert!(validate_device_path("/sdcard/foo bar").is_ok());
        assert!(validate_device_path("/sdcard/file:name.txt").is_ok());
    }

    #[test]
    fn normalize_collapses_slashes() {
        assert_eq!(normalize_device_path("/sdcard//DCIM/"), "/sdcard/DCIM");
        assert_eq!(normalize_device_path("/"), "/");
        assert_eq!(normalize_device_path("  /sdcard  "), "/sdcard");
    }
}
