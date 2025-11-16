use serde::{Deserialize, Serialize};
use crate::adb::Adb;
use crate::utils;

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
    USB,
    Wireless,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DeviceStatus {
    Connected,
    Disconnected,
    Unauthorized,
    Offline,
}

/// Get list of all connected devices (USB and wireless)
#[tauri::command]
pub async fn get_connected_devices(app: tauri::AppHandle) -> Result<Vec<Device>, String> {
    // Get ADB path
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);

    // Start ADB server if needed
    let _ = adb.start_server();

    // Get devices from ADB
    let adb_devices = adb.devices()?;

    // Convert ADB devices to our Device struct
    let mut devices = Vec::new();

    for adb_device in adb_devices {
        // Determine connection type (wireless if serial contains ':')
        let connection_type = if adb_device.serial.contains(':') {
            ConnectionType::Wireless
        } else {
            ConnectionType::USB
        };

        // Map ADB state to our DeviceStatus
        let status = match adb_device.state.as_str() {
            "device" => DeviceStatus::Connected,
            "unauthorized" => DeviceStatus::Unauthorized,
            "offline" => DeviceStatus::Offline,
            _ => DeviceStatus::Disconnected,
        };

        // Get device model name (use cached info from -l flag or fetch it)
        let model = if let Some(ref m) = adb_device.model {
            m.clone()
        } else {
            adb.get_model(Some(&adb_device.serial))
                .unwrap_or_else(|_| "Unknown".to_string())
        };

        // Extract IP address for wireless devices
        let ip_address = if connection_type == ConnectionType::Wireless {
            adb_device.serial.split(':').next().map(|s| s.to_string())
        } else {
            None
        };

        // Use model as name, or "Unknown Device"
        let name = if model != "Unknown" {
            model.clone()
        } else {
            "Unknown Device".to_string()
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
    let result = adb.connect(&ip, port)?;

    // Check if connection was successful
    if result.contains("connected") || result.contains("already connected") {
        Ok(true)
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
    let result = adb.disconnect(&device_id)?;

    // Check if disconnection was successful
    if result.contains("disconnected") {
        Ok(true)
    } else {
        Err(format!("Failed to disconnect: {}", result))
    }
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

    // Enable TCP/IP mode on port 5555
    adb.tcpip(Some(&device_id), 5555)?;

    // Wait a moment for the device to switch modes
    std::thread::sleep(std::time::Duration::from_secs(1));

    // Get device IP address
    let ip = adb.get_device_ip(Some(&device_id))?;

    Ok(ip)
}

/// Refresh the device list
#[tauri::command]
pub async fn refresh_devices(app: tauri::AppHandle) -> Result<Vec<Device>, String> {
    get_connected_devices(app).await
}

