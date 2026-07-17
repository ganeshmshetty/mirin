use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};
use std::collections::{HashSet, HashMap};
use std::path::PathBuf;
use std::fs;
use crate::adb::{Adb, MdnsService};

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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Hash)]
pub enum ConnectionType {
    #[serde(rename = "USB")]
    Usb,
    Wireless,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
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

fn tls_service_ip(serial: &str, services: &[MdnsService]) -> Option<String> {
    services.iter().find_map(|service| {
        if !service.service_type.contains("tls-connect") {
            return None;
        }
        let service_type = service.service_type.trim_end_matches('.');
        let dotted = format!("{}.{}", service.instance_name, service_type);
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

/// Raw connected devices from ADB
pub async fn get_connected_devices_impl(adb_path: PathBuf) -> Result<Vec<Device>, String> {
    let adb = Adb::new(adb_path);
    let _ = adb.start_server().await;

    let adb_devices = adb.devices().await?;
    let mdns_services = adb.get_mdns_services().await.unwrap_or_default();

    let mut devices = Vec::new();

    for adb_device in adb_devices {
        let is_tls = adb_device.serial.contains("_adb-tls-connect._tcp");
        if is_tls && adb_device.state.as_str() != "device" {
            continue;
        }

        let connection_type = if adb_device.serial.contains(':') || is_tls {
            ConnectionType::Wireless
        } else {
            ConnectionType::Usb
        };

        let status = match adb_device.state.as_str() {
            "device" => DeviceStatus::Connected,
            "unauthorized" => DeviceStatus::Unauthorized,
            "offline" => DeviceStatus::Offline,
            _ => DeviceStatus::Disconnected,
        };

        let mut model = String::new();
        let mut name = String::new();

        if status == DeviceStatus::Connected {
            let brand_raw = adb.get_prop(Some(&adb_device.serial), "ro.product.brand").await.unwrap_or_default();
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

        if name.is_empty() {
            name = crate::utils::names::get_deterministic_name(&adb_device.serial);
            model = if let Some(ref m) = adb_device.model {
                m.replace("_", " ")
            } else if let Some(ref product) = adb_device.product {
                product.replace("_", " ")
            } else {
                "Unknown Device".to_string()
            };
        }

        let ip_address = if is_tls {
            tls_service_ip(&adb_device.serial, &mdns_services)
        } else if connection_type == ConnectionType::Wireless {
            adb_device.serial.rsplit_once(':').map(|(ip, _)| ip.to_string())
        } else {
            None
        };

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

fn get_saved_devices_path() -> Result<PathBuf, String> {
    let config_dir = dirs::config_dir()
        .ok_or_else(|| "Failed to get config directory".to_string())?;
    let app_dir = config_dir.join("mirin");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    Ok(app_dir.join("saved_devices.json"))
}

pub async fn get_saved_devices_impl() -> Result<Vec<Device>, String> {
    let devices_path = get_saved_devices_path()?;
    if !devices_path.exists() {
        return Ok(Vec::new());
    }
    let content = fs::read_to_string(&devices_path)
        .map_err(|e| format!("Failed to read saved devices: {}", e))?;
    let devices: Vec<Device> = serde_json::from_str(&content).unwrap_or_default();
    Ok(devices)
}

pub async fn save_device_impl(mut device: Device) -> Result<bool, String> {
    let devices_path = get_saved_devices_path()?;
    if device.hardware_id.is_empty() {
        device.hardware_id = device.id.clone();
    }
    
    let mut saved_devices = get_saved_devices_impl().await.unwrap_or_default();
    if let Some(pos) = saved_devices.iter().position(|d| {
        d.hardware_id == device.hardware_id || d.id == device.id || d.id == device.hardware_id
    }) {
        saved_devices[pos] = device;
    } else {
        saved_devices.push(device);
    }
    
    let json = serde_json::to_string_pretty(&saved_devices)
        .map_err(|e| format!("Failed to serialize devices: {}", e))?;
    fs::write(&devices_path, json)
        .map_err(|e| format!("Failed to write saved devices: {}", e))?;
    Ok(true)
}

pub async fn remove_saved_device_impl(device_id: String) -> Result<bool, String> {
    let devices_path = get_saved_devices_path()?;
    if !devices_path.exists() {
        return Ok(false);
    }
    
    let mut saved_devices = get_saved_devices_impl().await?;
    let initial_len = saved_devices.len();
    saved_devices.retain(|d| {
        if d.id == device_id || d.hardware_id == device_id {
            return false;
        }
        if d.id.contains(':') && device_id.contains(':') {
            let d_ip = d.id.split(':').next();
            let req_ip = device_id.split(':').next();
            if d_ip.is_some() && req_ip.is_some() && d_ip == req_ip {
                return false;
            }
        }
        true
    });
    
    if saved_devices.len() == initial_len {
        return Ok(false);
    }
    
    let json = serde_json::to_string_pretty(&saved_devices)
        .map_err(|e| format!("Failed to serialize devices: {}", e))?;
    fs::write(&devices_path, json)
        .map_err(|e| format!("Failed to write saved devices: {}", e))?;
    Ok(true)
}

pub async fn disconnect_device_impl(adb_path: PathBuf, device_id: String) -> Result<bool, String> {
    let adb = Adb::new(adb_path);
    let result = adb.disconnect(&device_id).await?;
    if result.contains("disconnected") {
        Ok(true)
    } else {
        Err(format!("Failed to disconnect: {}", result))
    }
}

#[derive(Clone)]
pub struct DeviceRegistry {
    forgotten_hw_ids: Arc<Mutex<HashSet<String>>>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_format_brand() {
        assert_eq!(format_brand("google"), "Google");
        assert_eq!(format_brand("samsung"), "Samsung");
        assert_eq!(format_brand("  xiaomi  "), "Xiaomi");
        assert_eq!(format_brand(""), "");
        assert_eq!(format_brand("oneplus co"), "Oneplus Co");
    }

    #[test]
    fn test_device_registry_forgotten_state() {
        let registry = DeviceRegistry::new();
        let hw_id = "hw_serial_123".to_string();

        assert!(!registry.is_forgotten(&hw_id));
        
        registry.mark_forgotten(hw_id.clone());
        assert!(registry.is_forgotten(&hw_id));

        registry.clear_forgotten(&hw_id);
        assert!(!registry.is_forgotten(&hw_id));
    }
}

impl DeviceRegistry {
    pub fn new() -> Self {
        Self {
            forgotten_hw_ids: Arc::new(Mutex::new(HashSet::new())),
        }
    }

    pub fn mark_forgotten(&self, hw_id: String) {
        if let Ok(mut forgotten) = self.forgotten_hw_ids.lock() {
            forgotten.insert(hw_id);
        }
    }

    pub fn is_forgotten(&self, hw_id: &str) -> bool {
        if let Ok(forgotten) = self.forgotten_hw_ids.lock() {
            forgotten.contains(hw_id)
        } else {
            false
        }
    }

    pub fn clear_forgotten(&self, hw_id: &str) {
        if let Ok(mut forgotten) = self.forgotten_hw_ids.lock() {
            forgotten.remove(hw_id);
        }
    }

    pub async fn get_resolved_devices(&self, adb_path: PathBuf) -> Result<Vec<Device>, String> {
        let connected_devices = get_connected_devices_impl(adb_path).await.unwrap_or_default();
        let saved_devices = get_saved_devices_impl().await.unwrap_or_default();

        let mut merged_devices_map: HashMap<String, Device> = HashMap::new();

        for device in saved_devices.clone() {
            let mut offline_device = device.clone();
            offline_device.status = DeviceStatus::Offline;
            for conn in &mut offline_device.connections {
                conn.status = DeviceStatus::Offline;
            }
            merged_devices_map.insert(device.id.clone(), offline_device);
        }

        for device in connected_devices {
            if let Some(existing) = merged_devices_map.get_mut(&device.id) {
                existing.status = device.status.clone();
                existing.ip_address = device.ip_address.clone();
                existing.connections = device.connections.clone();
                if existing.name.is_empty() && !device.name.is_empty() {
                    existing.name = device.name.clone();
                }
            } else {
                merged_devices_map.insert(device.id.clone(), device);
            }
        }

        let mut hw_map: HashMap<String, Device> = HashMap::new();
        for device in merged_devices_map.into_values() {
            let key = if device.hardware_id.is_empty() {
                device.id.clone()
            } else {
                device.hardware_id.clone()
            };

            if let Some(existing) = hw_map.get_mut(&key) {
                let device_connected = device.status == DeviceStatus::Connected;
                let existing_connected = existing.status == DeviceStatus::Connected;

                let prefer_device = if device_connected && device.connection_type == ConnectionType::Wireless {
                    true
                } else if existing_connected && existing.connection_type == ConnectionType::Wireless {
                    false
                } else if device_connected {
                    true
                } else if existing_connected {
                    false
                } else if device.connection_type == ConnectionType::Wireless {
                    true
                } else {
                    false
                };

                let active_id = if prefer_device { device.id.clone() } else { existing.id.clone() };
                let active_conn_type = if prefer_device { device.connection_type.clone() } else { existing.connection_type.clone() };
                let active_name = if !existing.name.is_empty() { existing.name.clone() } else { device.name.clone() };
                let active_model = if !existing.model.is_empty() { existing.model.clone() } else { device.model.clone() };
                let active_status = if device_connected { device.status.clone() } else { existing.status.clone() };
                let active_ip = if prefer_device { device.ip_address.clone() } else { existing.ip_address.clone() };

                let mut conn_map: HashMap<String, DeviceConnection> = HashMap::new();
                for conn in &existing.connections {
                    conn_map.insert(conn.id.clone(), conn.clone());
                }
                for conn in &device.connections {
                    if let Some(existing_conn) = conn_map.get_mut(&conn.id) {
                        if conn.status == DeviceStatus::Connected {
                            existing_conn.status = DeviceStatus::Connected;
                        }
                    } else {
                        conn_map.insert(conn.id.clone(), conn.clone());
                    }
                }

                let mut merged_connections: Vec<DeviceConnection> = conn_map.into_values().collect();
                merged_connections.sort_by_key(|c| match c.connection_type {
                    ConnectionType::Usb => 0,
                    ConnectionType::Wireless => 1,
                });

                existing.id = active_id;
                existing.name = active_name;
                existing.model = active_model;
                existing.status = active_status;
                existing.connection_type = active_conn_type;
                existing.ip_address = active_ip;
                existing.connections = merged_connections;
            } else {
                hw_map.insert(key, device);
            }
        }

        // Persistence is explicit: the connect flow saves devices after the user selects
        // them. Resolving live ADB state must not make a device disappear from that flow.
        Ok(hw_map.into_values().collect())
    }

    pub async fn forget_device(&self, adb_path: PathBuf, device_id: String) -> Result<bool, String> {
        let devices = self.get_resolved_devices(adb_path.clone()).await?;
        let device_opt = devices.iter().find(|d| d.id == device_id || d.hardware_id == device_id);

        if let Some(device) = device_opt {
            let hw_id = device.hardware_id.clone();
            if !hw_id.is_empty() {
                self.mark_forgotten(hw_id.clone());
            }

            for conn in &device.connections {
                if conn.connection_type == ConnectionType::Wireless {
                    let _ = disconnect_device_impl(adb_path.clone(), conn.id.clone()).await;
                }
            }

            let mut ids_to_remove = HashSet::new();
            ids_to_remove.insert(device_id.clone());
            ids_to_remove.insert(device.id.clone());
            if !device.hardware_id.is_empty() {
                ids_to_remove.insert(device.hardware_id.clone());
            }
            for conn in &device.connections {
                ids_to_remove.insert(conn.id.clone());
            }

            for id in ids_to_remove {
                let _ = remove_saved_device_impl(id).await;
            }

            Ok(true)
        } else {
            let _ = remove_saved_device_impl(device_id.clone()).await;
            if device_id.contains(':') {
                let _ = disconnect_device_impl(adb_path, device_id).await;
            }
            Ok(false)
        }
    }
}
