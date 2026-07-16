use serde::{Deserialize, Serialize};
use crate::adb::{Adb, MdnsService};
use crate::utils;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub hardware_id: String,
    pub name: String,
    pub model: String,
    pub connection_type: ConnectionType,
    pub status: DeviceStatus,
    pub ip_address: Option<String>,
    pub connections: Vec<DeviceConnection>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConnection {
    pub id: String,
    pub connection_type: ConnectionType,
    pub status: DeviceStatus,
    pub ip_address: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum ConnectionType {
    #[serde(rename = "USB")]
    Usb,
    Wireless,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum DeviceStatus {
    Connected,
    Disconnected,
    Unauthorized,
    Offline,
}

fn format_brand(brand: &str) -> String {
    let brand = brand.trim().to_lowercase();
    if brand.is_empty() {
        return String::new();
    }
    
    brand.split_whitespace()
        .map(|word| {
            let mut chars = word.chars();
            match chars.next() {
                None => String::new(),
                Some(first) => first.to_uppercase().collect::<String>() + chars.as_str(),
            }
        })
        .collect::<Vec<String>>()
        .join(" ")
}

/// Resolve the LAN IP for an Android 11+ TLS ADB serial via mDNS.
///
/// ADB may report the serial as either:
/// - `adb-XXXX._adb-tls-connect._tcp` (dot form)
/// - `adb-XXXX_adb-tls-connect._tcp`  (underscore form)
/// while `adb mdns services` lists instance + type separately.
fn tls_service_ip(serial: &str, services: &[MdnsService]) -> Option<String> {
    services.iter().find_map(|service| {
        if !service.service_type.contains("tls-connect") {
            return None;
        }
        let service_type = service.service_type.trim_end_matches('.');
        let dotted = format!("{}.{}", service.instance_name, service_type);
        // ADB sometimes uses underscore between instance and type instead of a dot.
        let underscored = format!(
            "{}_{}",
            service.instance_name,
            service_type.trim_start_matches('_')
        );
        let matches = serial == dotted
            || serial == underscored
            || serial == service.instance_name
            || (!service.instance_name.is_empty() && serial.starts_with(&service.instance_name));
        if matches {
            service
                .address
                .rsplit_once(':')
                .map(|(ip, _)| ip.to_string())
        } else {
            None
        }
    })
}

/// Get list of all connected devices (USB and wireless)
#[tauri::command]
pub async fn get_connected_devices(app: tauri::AppHandle) -> Result<Vec<Device>, String> {
    // Get ADB path
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);

    // Start ADB server if needed (this can be slow on first call)
    let _ = adb.start_server().await;

    // Get devices from ADB
    let adb_devices = adb.devices().await?;
    let mdns_services = adb.get_mdns_services().await.unwrap_or_default();

    // Convert ADB devices to our Device struct
    let mut devices = Vec::new();

    for adb_device in adb_devices {
        // Skip non-connected TLS devices (wireless debugging ghost entries)
        let is_tls = adb_device.serial.contains("_adb-tls-connect._tcp");
        if is_tls && adb_device.state.as_str() != "device" {
            continue;
        }

        // Determine connection type:
        //  - serial contains ':'          → IP:port format (traditional TCP/IP)
        //  - serial contains "_tcp"       → ADB over TLS (Android 11+ wireless debugging)
        let connection_type = if adb_device.serial.contains(':') || is_tls {
            ConnectionType::Wireless
        } else {
            ConnectionType::Usb
        };

        // Map ADB state to our DeviceStatus
        let status = match adb_device.state.as_str() {
            "device" => DeviceStatus::Connected,
            "unauthorized" => DeviceStatus::Unauthorized,
            "offline" => DeviceStatus::Offline,
            _ => DeviceStatus::Disconnected,
        };

        let mut model = String::new();
        let mut name = String::new();

        if status == DeviceStatus::Connected {
            // Fetch brand
            let brand_raw = adb.get_prop(Some(&adb_device.serial), "ro.product.brand").await.unwrap_or_default();
            // Fetch model
            let model_raw = adb.get_prop(Some(&adb_device.serial), "ro.product.model").await.unwrap_or_default();

            if !model_raw.is_empty() {
                let brand_formatted = format_brand(&brand_raw);
                model = model_raw.trim().replace("_", " ");
                
                if model.to_lowercase().starts_with(&brand_formatted.to_lowercase()) {
                    name = model.clone();
                } else if !brand_formatted.is_empty() {
                    name = format!("{} {}", brand_formatted, model);
                } else {
                    name = model.clone();
                }
            }
        }

        // Fallback if name is empty (unauthorized, offline, or query failed)
        if name.is_empty() {
            name = utils::names::get_deterministic_name(&adb_device.serial);
            // Model fallback
            model = if let Some(ref m) = adb_device.model {
                m.replace("_", " ")
            } else if let Some(ref product) = adb_device.product {
                product.replace("_", " ")
            } else {
                "Unknown Device".to_string()
            };
        }

        // Extract IP address for wireless devices
        let ip_address = if is_tls {
            tls_service_ip(&adb_device.serial, &mdns_services)
        } else if connection_type == ConnectionType::Wireless {
            adb_device.serial.rsplit_once(':').map(|(ip, _)| ip.to_string())
        } else {
            None
        };

        // hardware_id: for USB use the serial, for wireless try to get the USB serial
        let hardware_id = if (connection_type == ConnectionType::Wireless || is_tls) && status == DeviceStatus::Connected {
            adb.get_prop(Some(&adb_device.serial), "ro.serialno").await
                .unwrap_or_else(|_| adb_device.serial.clone())
        } else {
            adb_device.serial.clone()
        };

        let connection = DeviceConnection {
            id: adb_device.serial.clone(),
            connection_type: connection_type.clone(),
            status: status.clone(),
            ip_address: ip_address.clone(),
        };

        devices.push(Device {
            id: adb_device.serial,
            hardware_id,
            name,
            model,
            connection_type,
            status,
            ip_address,
            connections: vec![connection],
        });
    }

    Ok(devices)
}

/// Connect to a device wirelessly via IP address
#[tauri::command]
pub async fn connect_wireless_device(
    app: tauri::AppHandle,
    ip: String,
    port: Option<u16>,
) -> Result<bool, String> {
    let port = port.unwrap_or(5555);
    
    // Get ADB path
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);

    // Connect to device
    let result = adb.connect(&ip, port).await?;

    // Check if connection was successful
    let result_lower = result.to_lowercase();
    if result_lower.contains("connected") || result_lower.contains("already connected") {
        Ok(true)
    } else if result_lower.contains("unable to connect") || result_lower.contains("connection refused") {
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
    // Get ADB path
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);

    // Disconnect device
    let result = adb.disconnect(&device_id).await?;

    // Check if disconnection was successful
    if result.contains("disconnected") {
        Ok(true)
    } else {
        Err(format!("Failed to disconnect: {}", result))
    }
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
    // Get ADB path
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
    let adb = Adb::new(adb_path);

    // Fetch device info before switching (device may briefly go offline after tcpip)
    let brand_raw = adb.get_prop(Some(&device_id), "ro.product.brand").await.unwrap_or_default();
    let model_raw = adb.get_prop(Some(&device_id), "ro.product.model").await.unwrap_or_default();

    let name = if model_raw.is_empty() {
        utils::names::get_deterministic_name(&device_id)
    } else {
        let brand_formatted = format_brand(&brand_raw);
        let model_clean = model_raw.trim().replace("_", " ");
        if model_clean.to_lowercase().starts_with(&brand_formatted.to_lowercase()) {
            model_clean
        } else if !brand_formatted.is_empty() {
            format!("{} {}", brand_formatted, model_clean)
        } else {
            model_clean
        }
    };

    let model = model_raw.trim().replace("_", " ");

    // Enable wireless debugging and wait for IP address
    let ip = adb.enable_wireless_mode_and_wait(&device_id).await?;
    let wireless_id = format!("{}:5555", ip);

    // Connect to the device wirelessly
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

/// Get the path to the saved devices file
fn get_saved_devices_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Failed to get config directory".to_string())?;
    
    let app_dir = config_dir.join("mirin");
    
    // Create directory if it doesn't exist
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    
    Ok(app_dir.join("saved_devices.json"))
}

/// Save a device to the saved devices list
#[tauri::command]
pub async fn save_device(mut device: Device) -> Result<bool, String> {
    let devices_path = get_saved_devices_path()?;

    // One physical device → one saved record (keyed by hardware_id).
    if device.hardware_id.is_empty() {
        device.hardware_id = device.id.clone();
    }
    
    // Read existing devices (invalid/legacy files are treated as empty)
    let mut saved_devices: Vec<Device> = if devices_path.exists() {
        let content = fs::read_to_string(&devices_path)
            .map_err(|e| format!("Failed to read saved devices: {}", e))?;
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    };
    
    if let Some(pos) = saved_devices.iter().position(|d| {
        d.hardware_id == device.hardware_id || d.id == device.id || d.id == device.hardware_id
    }) {
        saved_devices[pos] = device;
    } else {
        saved_devices.push(device);
    }
    
    // Write back to file
    let json = serde_json::to_string_pretty(&saved_devices)
        .map_err(|e| format!("Failed to serialize devices: {}", e))?;
    
    fs::write(&devices_path, json)
        .map_err(|e| format!("Failed to write saved devices: {}", e))?;
    
    Ok(true)
}

/// Get all saved devices
#[tauri::command]
pub async fn get_saved_devices() -> Result<Vec<Device>, String> {
    let devices_path = get_saved_devices_path()?;
    
    if !devices_path.exists() {
        return Ok(Vec::new());
    }
    
    let content = fs::read_to_string(&devices_path)
        .map_err(|e| format!("Failed to read saved devices: {}", e))?;
    
    // Legacy records without hardware_id/connections are discarded (no migration).
    let devices: Vec<Device> = serde_json::from_str(&content).unwrap_or_default();
    
    Ok(devices)
}

/// Remove a device from saved devices
#[tauri::command]
pub async fn remove_saved_device(device_id: String) -> Result<bool, String> {
    let devices_path = get_saved_devices_path()?;
    
    if !devices_path.exists() {
        return Ok(false);
    }
    
    // Read existing devices
    let content = fs::read_to_string(&devices_path)
        .map_err(|e| format!("Failed to read saved devices: {}", e))?;
    
    let mut saved_devices: Vec<Device> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse saved devices: {}", e))?;
    
    // Remove device by ID or hardware_id
    let initial_len = saved_devices.len();
    saved_devices.retain(|d| {
        if d.id == device_id {
            return false; // Remove it
        }

        // Also match by hardware_id (same physical device, different connection)
        if d.hardware_id == device_id {
            return false;
        }

        // If it's a wireless device (IP:port format), compare the IP addresses
        if d.id.contains(':') && device_id.contains(':') {
            let d_ip = d.id.split(':').next();
            let req_ip = device_id.split(':').next();
            if d_ip.is_some() && req_ip.is_some() && d_ip == req_ip {
                return false; // Remove it (IP matches)
            }
        }
        
        true // Keep it
    });
    
    if saved_devices.len() == initial_len {
        return Ok(false); // Device not found
    }
    
    // Write back to file
    let json = serde_json::to_string_pretty(&saved_devices)
        .map_err(|e| format!("Failed to serialize devices: {}", e))?;
    
    fs::write(&devices_path, json)
        .map_err(|e| format!("Failed to write saved devices: {}", e))?;
    
    Ok(true)
}

#[derive(serde::Serialize)]
pub struct DeviceDetails {
    pub serial: String,
    pub manufacturer: String,
    pub android_version: String,
    pub battery_level: i32,
    pub storage_used_gb: u64,
    pub storage_total_gb: u64,
}

#[tauri::command]
pub async fn get_device_details(app: tauri::AppHandle, device_id: String) -> Result<DeviceDetails, String> {
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);

    // Prefer the hardware serial (stable across USB/WiFi transports).
    let serial = adb
        .get_prop(None, "ro.serialno")
        .await
        .unwrap_or_else(|_| device_id.clone());

    // Fetch manufacturer
    let manufacturer = adb.get_manufacturer(None).await.unwrap_or_else(|_| "Unknown".to_string());
    
    // Fetch Android Version
    let android_version = adb.get_android_version(None).await.unwrap_or_else(|_| "Unknown".to_string());

    // Fetch Battery Level
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

    // Fetch Storage info
    let mut storage_used_gb = 0;
    let mut storage_total_gb = 0;
    
    // Check df output
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

    // Fallback if df -k /sdcard fails
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::adb::MdnsService;

    #[test]
    fn tls_service_ip_matches_dot_and_underscore_serials() {
        let services = vec![MdnsService {
            instance_name: "adb-RF8M52ABC".into(),
            service_type: "_adb-tls-connect._tcp.".into(),
            address: "192.168.1.42:37125".into(),
        }];

        assert_eq!(
            tls_service_ip("adb-RF8M52ABC._adb-tls-connect._tcp", &services).as_deref(),
            Some("192.168.1.42")
        );
        assert_eq!(
            tls_service_ip("adb-RF8M52ABC_adb-tls-connect._tcp", &services).as_deref(),
            Some("192.168.1.42")
        );
        assert_eq!(
            tls_service_ip("adb-OTHER_adb-tls-connect._tcp", &services),
            None
        );
    }
}
