use serde::{Deserialize, Serialize};
use crate::adb::{Adb, MdnsService};
use crate::utils;
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: String,
    pub name: String,
    pub model: String,
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

    // Convert ADB devices to our Device struct
    let mut devices = Vec::new();

    for adb_device in adb_devices {
        // Determine connection type (wireless if serial contains ':')
        let connection_type = if adb_device.serial.contains(':') {
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
        let ip_address = if connection_type == ConnectionType::Wireless {
            adb_device.serial.split(':').next().map(|s| s.to_string())
        } else {
            None
        };

        devices.push(Device {
            id: adb_device.serial,
            name,
            model,
            connection_type,
            status,
            ip_address,
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
pub async fn save_device(device: Device) -> Result<bool, String> {
    let devices_path = get_saved_devices_path()?;
    
    // Read existing devices
    let mut saved_devices: Vec<Device> = if devices_path.exists() {
        let content = fs::read_to_string(&devices_path)
            .map_err(|e| format!("Failed to read saved devices: {}", e))?;
        serde_json::from_str(&content)
            .map_err(|e| format!("Failed to parse saved devices: {}", e))?
    } else {
        Vec::new()
    };
    
    // Check if device already exists (by ID)
    if let Some(pos) = saved_devices.iter().position(|d| d.id == device.id) {
        // Update existing device
        saved_devices[pos] = device;
    } else {
        // Add new device
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
    
    let devices: Vec<Device> = serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse saved devices: {}", e))?;
    
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
    
    // Remove device by ID
    let initial_len = saved_devices.len();
    saved_devices.retain(|d| {
        if d.id == device_id {
            return false; // Remove it
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
