use crate::adb::Adb;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppInfo {
    pub package_name: String,
    pub is_system: bool,
}

/// Android package names are reverse-DNS identifiers (letters, digits, underscore, dots).
pub fn validate_package_name(package_name: &str) -> Result<(), String> {
    let pkg = package_name.trim();
    if pkg.is_empty() {
        return Err("Package name must not be empty".to_string());
    }
    if pkg.len() > 255 {
        return Err("Package name is too long".to_string());
    }
    if !pkg
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '_' || c == '/')
    {
        return Err(format!("Invalid package name: '{}'", package_name));
    }
    Ok(())
}

fn parse_package_list(output: &str, is_system: bool) -> Vec<AppInfo> {
    output
        .lines()
        .filter_map(|line| {
            line.strip_prefix("package:").map(|pkg| AppInfo {
                package_name: pkg.trim().to_string(),
                is_system,
            })
        })
        .filter(|app| !app.package_name.is_empty())
        .collect()
}

pub async fn list_apps_impl(adb_path: PathBuf, device_id: String) -> Result<Vec<AppInfo>, String> {
    let adb = Adb::new(adb_path).with_device(&device_id);

    // Third-party packages (-3) and system packages (-s) with accurate is_system flags.
    let third_party = adb
        .execute(&["shell", "pm", "list", "packages", "-3"])
        .await
        .unwrap_or_default();
    let system = adb
        .execute(&["shell", "pm", "list", "packages", "-s"])
        .await
        .unwrap_or_default();

    let mut apps = parse_package_list(&third_party, false);
    apps.extend(parse_package_list(&system, true));

    // Deduplicate by package name (prefer third-party flag if both lists claim it).
    let mut seen = std::collections::HashSet::new();
    apps.retain(|a| seen.insert(a.package_name.clone()));

    apps.sort_by(|a, b| {
        a.is_system
            .cmp(&b.is_system) // third-party first
            .then_with(|| a.package_name.cmp(&b.package_name))
    });
    Ok(apps)
}

pub async fn install_app_impl(
    adb_path: PathBuf,
    device_id: String,
    apk_path: String,
) -> Result<(), String> {
    if apk_path.trim().is_empty() {
        return Err("APK path must not be empty".to_string());
    }
    let adb = Adb::new(adb_path).with_device(&device_id);
    // Use -r to replace existing application
    adb.execute(&["install", "-r", &apk_path]).await?;
    Ok(())
}

pub async fn uninstall_app_impl(
    adb_path: PathBuf,
    device_id: String,
    package_name: String,
) -> Result<(), String> {
    validate_package_name(&package_name)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["uninstall", package_name.trim()]).await?;
    Ok(())
}

pub async fn launch_app_impl(
    adb_path: PathBuf,
    device_id: String,
    package_name: String,
) -> Result<(), String> {
    validate_package_name(&package_name)?;
    let pkg = package_name.trim();
    let adb = Adb::new(adb_path).with_device(&device_id);

    let out = adb
        .execute(&[
            "shell",
            "cmd",
            "package",
            "resolve-activity",
            "--brief",
            pkg,
        ])
        .await
        .map_err(|e| format!("Failed to resolve activity for '{}': {}", pkg, e))?;

    let resolved = out.lines().last().unwrap_or("").trim();
    if resolved.contains('/') && !resolved.contains("No activity found") {
        adb.execute(&["shell", "am", "start", "-n", resolved])
            .await
            .map_err(|e| format!("Failed to start '{}': {}", resolved, e))?;
        return Ok(());
    }

    // Fallback for devices where resolve-activity is unavailable.
    adb.execute(&[
        "shell",
        "monkey",
        "-p",
        pkg,
        "-c",
        "android.intent.category.LAUNCHER",
        "1",
    ])
    .await
    .map_err(|e| {
        format!(
            "Could not resolve launcher activity for '{}' and monkey fallback failed: {}",
            pkg, e
        )
    })?;
    Ok(())
}

pub async fn clear_app_data_impl(
    adb_path: PathBuf,
    device_id: String,
    package_name: String,
) -> Result<(), String> {
    validate_package_name(&package_name)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "pm", "clear", package_name.trim()])
        .await?;
    Ok(())
}

pub async fn stop_app_impl(
    adb_path: PathBuf,
    device_id: String,
    package_name: String,
) -> Result<(), String> {
    validate_package_name(&package_name)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    adb.execute(&["shell", "am", "force-stop", package_name.trim()])
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_empty_and_metachar_packages() {
        assert!(validate_package_name("").is_err());
        assert!(validate_package_name("   ").is_err());
        assert!(validate_package_name("com.evil;rm -rf").is_err());
        assert!(validate_package_name("com.ok.app").is_ok());
        assert!(validate_package_name("com.ok/app.Main").is_ok());
        assert!(validate_package_name("a.b.c.d_1.2").is_ok());
    }

    #[test]
    fn test_parse_package_list() {
        let output = "package:com.android.settings\npackage:com.example.app\npackage:\n";
        let parsed = parse_package_list(output, false);
        assert_eq!(parsed.len(), 2);
        assert_eq!(parsed[0].package_name, "com.android.settings");
        assert!(!parsed[0].is_system);
        assert_eq!(parsed[1].package_name, "com.example.app");
    }
}
