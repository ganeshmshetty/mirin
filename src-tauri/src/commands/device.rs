use crate::utils;
use mirin_core::adb::{Adb, MdnsService};
pub use mirin_core::device_registry::{ConnectionType, Device, DeviceConnection, DeviceStatus};

#[derive(serde::Serialize)]
pub struct DeviceDetails {
    pub serial: String,
    pub manufacturer: String,
    pub android_version: String,
    pub battery_level: i32,
    pub storage_used_gb: u64,
    pub storage_total_gb: u64,
}

/// Get list of all connected devices (USB and wireless)
#[tauri::command]
pub async fn get_connected_devices(app: tauri::AppHandle) -> Result<Vec<Device>, String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::device_registry::get_connected_devices_impl(adb_path).await
}

/// Connect to a device wirelessly via IP address
#[tauri::command]
pub async fn connect_wireless_device(
    app: tauri::AppHandle,
    ip: String,
    port: Option<u16>,
) -> Result<bool, String> {
    let port = port.unwrap_or(5555);
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);

    let result = adb.connect(&ip, port).await?;

    let result_lower = result.to_lowercase();
    if result_lower.contains("connected") || result_lower.contains("already connected") {
        Ok(true)
    } else if result_lower.contains("unable to connect")
        || result_lower.contains("connection refused")
    {
        Err(format!(
            "Unable to connect to {}:{}. Please check:\n\
            • Device and computer are on the same network\n\
            • WiFi router doesn't have 'AP Isolation' enabled\n\
            • Device has USB debugging enabled\n\
            • Try connecting laptop directly to phone's hotspot",
            ip, port
        ))
    } else if result_lower.contains("timeout") {
        Err(format!(
            "Connection timed out to {}:{}. The device may be unreachable.\n\
            Try: Check if your WiFi router blocks device-to-device communication.",
            ip, port
        ))
    } else {
        Err(format!("Failed to connect: {}", result))
    }
}

/// Disconnect a specific device
#[tauri::command]
pub async fn disconnect_device(app: tauri::AppHandle, device_id: String) -> Result<bool, String> {
    let adb_path = utils::get_adb_path(&app)?;
    mirin_core::device_registry::disconnect_device_impl(adb_path, device_id).await
}

/// Pair with a device wirelessly using a pairing code (Android 11+)
#[tauri::command]
pub async fn pair_wireless_device(
    app: tauri::AppHandle,
    ip: String,
    port: u16,
    pairing_code: String,
) -> Result<bool, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);

    let result = adb.pair(&ip, port, &pairing_code).await?;

    let result_lower = result.to_lowercase();
    if result_lower.contains("successfully paired") {
        Ok(true)
    } else {
        Err(format!("Failed to pair: {}", result))
    }
}

/// Get mDNS services for Android 11+ wireless discovery
#[tauri::command]
pub async fn get_mdns_services(app: tauri::AppHandle) -> Result<Vec<MdnsService>, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);
    adb.get_mdns_services().await
}

/// Enable wireless debugging on a USB-connected device
#[tauri::command]
pub async fn enable_wireless_mode(
    app: tauri::AppHandle,
    device_id: String,
) -> Result<String, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);

    adb.enable_wireless_mode_and_wait(&device_id).await
}

/// One-click switch a USB-connected device to wireless mode and connect
#[tauri::command]
pub async fn switch_to_wireless(
    app: tauri::AppHandle,
    device_id: String,
) -> Result<Device, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path.clone());

    let brand_raw = adb
        .get_prop(Some(&device_id), "ro.product.brand")
        .await
        .unwrap_or_default();
    let model_raw = adb
        .get_prop(Some(&device_id), "ro.product.model")
        .await
        .unwrap_or_default();

    let name = if model_raw.is_empty() {
        mirin_core::utils::names::get_deterministic_name(&device_id)
    } else {
        let brand_formatted = {
            let brand = brand_raw.trim().to_lowercase();
            if brand.is_empty() {
                String::new()
            } else {
                brand
                    .split_whitespace()
                    .map(|word| {
                        let mut chars = word.chars();
                        match chars.next() {
                            None => String::new(),
                            Some(first) => {
                                first.to_uppercase().collect::<String>() + chars.as_str()
                            }
                        }
                    })
                    .collect::<Vec<String>>()
                    .join(" ")
            }
        };
        let model_clean = model_raw.trim().replace("_", " ");
        if model_clean
            .to_lowercase()
            .starts_with(&brand_formatted.to_lowercase())
        {
            model_clean
        } else if !brand_formatted.is_empty() {
            format!("{} {}", brand_formatted, model_clean)
        } else {
            model_clean
        }
    };

    let model = model_raw.trim().replace("_", " ");

    let ip = adb.enable_wireless_mode_and_wait(&device_id).await?;
    let wireless_id = format!("{}:5555", ip);

    let result = adb.connect(&ip, 5555).await?;
    let result_lower = result.to_lowercase();
    if !result_lower.contains("connected") && !result_lower.contains("already connected") {
        return Err(format!(
            "Wireless mode enabled at {} but connection failed: {}. Try connecting manually.",
            ip, result
        ));
    }

    let connection = DeviceConnection {
        id: wireless_id.clone(),
        connection_type: ConnectionType::Wireless,
        status: DeviceStatus::Connected,
        ip_address: Some(ip.clone()),
    };

    Ok(Device {
        id: wireless_id,
        hardware_id: device_id,
        name,
        model,
        connection_type: ConnectionType::Wireless,
        status: DeviceStatus::Connected,
        ip_address: Some(ip),
        connections: vec![connection],
    })
}

/// Refresh the device list
#[tauri::command]
pub async fn refresh_devices(app: tauri::AppHandle) -> Result<Vec<Device>, String> {
    get_connected_devices(app).await
}

/// Save a device to the saved devices list
#[tauri::command]
pub async fn save_device(
    device: Device,
    registry: tauri::State<'_, mirin_core::device_registry::DeviceRegistry>,
) -> Result<bool, String> {
    let saved = mirin_core::device_registry::save_device_impl(device.clone()).await?;
    registry.clear_device_forgotten(&device);
    Ok(saved)
}

/// Get all saved devices
#[tauri::command]
pub async fn get_saved_devices() -> Result<Vec<Device>, String> {
    mirin_core::device_registry::get_saved_devices_impl().await
}

/// Remove a device from saved devices
#[tauri::command]
pub async fn remove_saved_device(device_id: String) -> Result<bool, String> {
    mirin_core::device_registry::remove_saved_device_impl(device_id).await
}

/// Get dynamic device details (battery, storage, manufacturer, version)
#[tauri::command]
pub async fn get_device_details(
    app: tauri::AppHandle,
    device_id: String,
) -> Result<DeviceDetails, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);

    let serial = adb
        .get_prop(None, "ro.serialno")
        .await
        .unwrap_or_else(|_| device_id.clone());

    let manufacturer = adb
        .get_manufacturer(None)
        .await
        .unwrap_or_else(|_| "Unknown".to_string());
    let android_version = adb
        .get_android_version(None)
        .await
        .unwrap_or_else(|_| "Unknown".to_string());

    let mut battery_level = 100;
    if let Ok(battery_raw) = adb.shell(None, "dumpsys battery").await {
        for line in battery_raw.lines() {
            if line.trim().to_lowercase().starts_with("level:") {
                if let Some(level_str) = line.split(':').nth(1) {
                    if let Ok(level) = level_str.trim().parse::<i32>() {
                        battery_level = level;
                    }
                }
            }
        }
    }

    let mut storage_used_gb = 0;
    let mut storage_total_gb = 0;

    if let Ok(df_raw) = adb.shell(None, "df -k /sdcard").await {
        let lines: Vec<&str> = df_raw.lines().collect();
        if lines.len() > 1 {
            let parts: Vec<&str> = lines[1].split_whitespace().collect();
            if parts.len() > 2 {
                if let Ok(total_kb) = parts[1].parse::<u64>() {
                    storage_total_gb = total_kb / 1024 / 1024;
                }
                if let Ok(used_kb) = parts[2].parse::<u64>() {
                    storage_used_gb = used_kb / 1024 / 1024;
                }
            }
        }
    }

    if storage_total_gb == 0 {
        if let Ok(df_raw) = adb.shell(None, "df -k /data").await {
            let lines: Vec<&str> = df_raw.lines().collect();
            if lines.len() > 1 {
                let parts: Vec<&str> = lines[1].split_whitespace().collect();
                if parts.len() > 2 {
                    if let Ok(total_kb) = parts[1].parse::<u64>() {
                        storage_total_gb = total_kb / 1024 / 1024;
                    }
                    if let Ok(used_kb) = parts[2].parse::<u64>() {
                        storage_used_gb = used_kb / 1024 / 1024;
                    }
                }
            }
        }
    }

    Ok(DeviceDetails {
        serial: serial.trim().to_string(),
        manufacturer: manufacturer.trim().to_string(),
        android_version: android_version.trim().to_string(),
        battery_level,
        storage_used_gb,
        storage_total_gb,
    })
}

#[tauri::command]
pub async fn get_resolved_devices(
    app: tauri::AppHandle,
    registry: tauri::State<'_, mirin_core::device_registry::DeviceRegistry>,
) -> Result<Vec<Device>, String> {
    let adb_path = utils::get_adb_path(&app)?;
    registry.get_resolved_devices(adb_path).await
}

#[tauri::command]
pub async fn forget_device(
    app: tauri::AppHandle,
    registry: tauri::State<'_, mirin_core::device_registry::DeviceRegistry>,
    device_id: String,
) -> Result<bool, String> {
    let adb_path = utils::get_adb_path(&app)?;
    registry.forget_device(adb_path, device_id).await
}
