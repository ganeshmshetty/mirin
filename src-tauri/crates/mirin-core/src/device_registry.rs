use crate::adb::{Adb, MdnsService};
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
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
    #[serde(default)]
    pub favorite: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceConnection {
    pub id: String,
    pub connection_type: ConnectionType,
    pub status: DeviceStatus,
    pub ip_address: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
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

    brand
        .split_whitespace()
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

fn tls_service_endpoint(serial: &str, services: &[MdnsService]) -> Option<(String, u16)> {
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
                .and_then(|(ip, port)| Some((ip.to_string(), port.parse::<u16>().ok()?)))
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
            let brand_raw = adb
                .get_prop(Some(&adb_device.serial), "ro.product.brand")
                .await
                .unwrap_or_default();
            let model_raw = adb
                .get_model(Some(&adb_device.serial))
                .await
                .unwrap_or_default();

            if !model_raw.is_empty() {
                let brand_formatted = format_brand(&brand_raw);
                model = model_raw.trim().replace("_", " ");

                if model
                    .to_lowercase()
                    .starts_with(&brand_formatted.to_lowercase())
                {
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

        let (ip_address, port) = if is_tls {
            tls_service_endpoint(&adb_device.serial, &mdns_services)
                .map(|(ip, port)| (Some(ip), Some(port)))
                .unwrap_or((None, None))
        } else if connection_type == ConnectionType::Wireless {
            adb_device
                .serial
                .rsplit_once(':')
                .and_then(|(ip, port)| {
                    port.parse::<u16>()
                        .ok()
                        .map(|port| (Some(ip.to_string()), Some(port)))
                })
                .unwrap_or((None, None))
        } else {
            (None, None)
        };

        let hardware_id = if (connection_type == ConnectionType::Wireless || is_tls)
            && status == DeviceStatus::Connected
        {
            adb.get_prop(Some(&adb_device.serial), "ro.serialno")
                .await
                .unwrap_or_else(|_| adb_device.serial.clone())
        } else {
            adb_device.serial.clone()
        };

        let connection = DeviceConnection {
            id: adb_device.serial.clone(),
            connection_type: connection_type.clone(),
            status: status.clone(),
            ip_address: ip_address.clone(),
            port,
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
            favorite: false,
        });
    }

    Ok(devices)
}

fn get_saved_devices_path() -> Result<PathBuf, String> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| "Failed to get config directory".to_string())?;
    let app_dir = config_dir.join("mirin");
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)
            .map_err(|e| format!("Failed to create config directory: {}", e))?;
    }
    Ok(app_dir.join("saved_devices.json"))
}

pub fn get_wallpapers_dir_path() -> Result<PathBuf, String> {
    let config_dir =
        dirs::config_dir().ok_or_else(|| "Failed to get config directory".to_string())?;
    let wallpapers_dir = config_dir.join("mirin").join("wallpapers");
    if !wallpapers_dir.exists() {
        fs::create_dir_all(&wallpapers_dir)
            .map_err(|e| format!("Failed to create wallpapers directory: {}", e))?;
    }
    Ok(wallpapers_dir)
}

/// Build a filesystem-safe wallpaper cache key (filename stem) from a device or
/// hardware id, so it can never escape `wallpapers_dir`.
///
/// Path separators (both `/` and `\`), control characters, and other filesystem
/// unsafe characters (`<>:"|?*` and the like) are replaced with `_`.
/// `..` traversal sequences are also drained, guaranteeing the result is a single
/// safe filename component regardless of the raw identifier.
fn wallpaper_cache_key(id: &str) -> String {
    let mut key = String::with_capacity(id.len());
    for c in id.chars() {
        if c.is_ascii_alphanumeric() || c == '_' || c == '-' || c == '.' {
            key.push(c);
        } else {
            key.push('_');
        }
    }
    // Neutralize path-traversal sequences (e.g. "..", "...") while keeping
    // single dots used in IP addresses.
    while key.contains("..") {
        key = key.replace("..", "");
    }
    key
}

/// Best-effort image MIME type from magic bytes. JPEG is detected via its
/// signature; everything else (including PNG) is treated as PNG, matching the
/// cache's default encoding. Falls back to PNG for unknown/empty data so the
/// caller's base64 data URL stays well-formed.
fn image_mime_type(bytes: &[u8]) -> &'static str {
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        "image/jpeg"
    } else {
        "image/png"
    }
}

pub async fn get_device_wallpaper_impl(
    adb_path: PathBuf,
    device_id: String,
    hardware_id: String,
    fetch_from_adb: bool,
) -> Result<Option<String>, String> {
    let wallpapers_dir = get_wallpapers_dir_path()?;

    let key = if !hardware_id.is_empty() {
        wallpaper_cache_key(&hardware_id)
    } else {
        wallpaper_cache_key(&device_id)
    };

    let wallpaper_file = wallpapers_dir.join(format!("{}.png", key));

    if fetch_from_adb {
        let adb = Adb::new(adb_path.clone()).with_device(&device_id);
        if let Ok(png_bytes) = adb.fetch_wallpaper().await {
            if !png_bytes.is_empty() {
                let _ = fs::write(&wallpaper_file, &png_bytes);
                let dev_key = wallpaper_cache_key(&device_id);
                if dev_key != key {
                    let _ = fs::write(wallpapers_dir.join(format!("{}.png", dev_key)), &png_bytes);
                }
            }
        }
    }

    if wallpaper_file.exists() {
        if let Ok(bytes) = fs::read(&wallpaper_file) {
            if !bytes.is_empty() {
                let mime = image_mime_type(&bytes);
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Ok(Some(format!("data:{};base64,{}", mime, b64)));
            }
        }
    }

    let dev_key = wallpaper_cache_key(&device_id);
    let dev_file = wallpapers_dir.join(format!("{}.png", dev_key));
    if dev_file.exists() {
        if let Ok(bytes) = fs::read(&dev_file) {
            if !bytes.is_empty() {
                let mime = image_mime_type(&bytes);
                let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
                return Ok(Some(format!("data:{};base64,{}", mime, b64)));
            }
        }
    }

    Ok(None)
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
    fs::write(&devices_path, json).map_err(|e| format!("Failed to write saved devices: {}", e))?;
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
    fs::write(&devices_path, json).map_err(|e| format!("Failed to write saved devices: {}", e))?;

    // Also clean up cached wallpaper
    if let Ok(w_dir) = get_wallpapers_dir_path() {
        let key = wallpaper_cache_key(&device_id);
        let _ = fs::remove_file(w_dir.join(format!("{}.png", key)));
    }

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

#[derive(Clone, Default)]
pub struct DeviceRegistry {}

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
    fn test_wallpaper_cache_key_sanitizes_and_preserves() {
        // Normal wireless id: colon mapped to underscore, dots/IP preserved.
        assert_eq!(
            wallpaper_cache_key("192.168.1.10:5555"),
            "192.168.1.10_5555"
        );
        // Forward and backslashes cannot become path separators, and ".." is neutralized.
        let evil = wallpaper_cache_key(r#"..\..\evil\..\..\etc\.."#);
        assert!(!evil.contains('/') && !evil.contains('\\') && !evil.contains(".."));
        assert!(!evil.is_empty());
        // Other filesystem-unsafe characters are replaced.
        let key = wallpaper_cache_key("a<:b>\"c?d*|e:f");
        assert!(!key.contains('<') && !key.matches(['<', '>', '"', '?', '*', '|']).any(|_| true));
    }
}

impl DeviceRegistry {
    pub fn new() -> Self {
        Self {}
    }


    pub async fn get_resolved_devices(&self, adb_path: PathBuf) -> Result<Vec<Device>, String> {
        let connected_devices = get_connected_devices_impl(adb_path)
            .await
            .unwrap_or_default();
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

                let prefer_device = if device_connected
                    && device.connection_type == ConnectionType::Wireless
                {
                    true
                } else if existing_connected && existing.connection_type == ConnectionType::Wireless
                {
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

                let active_id = if prefer_device {
                    device.id.clone()
                } else {
                    existing.id.clone()
                };
                let active_conn_type = if prefer_device {
                    device.connection_type.clone()
                } else {
                    existing.connection_type.clone()
                };
                let active_model = if device_connected
                    && !device.model.is_empty()
                    && device.model != "Unknown Device"
                {
                    device.model.clone()
                } else if !existing.model.is_empty() {
                    existing.model.clone()
                } else {
                    device.model.clone()
                };
                let active_name = if device_connected && !device.name.is_empty() && (
                    existing.name.is_empty()
                    || existing.name == existing.model
                    || existing.name.ends_with(&existing.model)
                    || existing.name == existing.id
                ) {
                    device.name.clone()
                } else if !existing.name.is_empty() {
                    existing.name.clone()
                } else {
                    device.name.clone()
                };
                let active_status = if device_connected {
                    device.status.clone()
                } else {
                    existing.status.clone()
                };
                let active_ip = if prefer_device {
                    device.ip_address.clone()
                } else {
                    existing.ip_address.clone()
                };

                let mut conn_map: HashMap<String, DeviceConnection> = HashMap::new();
                for conn in &existing.connections {
                    conn_map.insert(conn.id.clone(), conn.clone());
                }
                for conn in &device.connections {
                    if let Some(existing_conn) = conn_map.get_mut(&conn.id) {
                        if conn.status == DeviceStatus::Connected {
                            existing_conn.status = DeviceStatus::Connected;
                            existing_conn.ip_address = conn.ip_address.clone();
                            if conn.port.is_some() {
                                existing_conn.port = conn.port;
                            }
                        }
                    } else {
                        conn_map.insert(conn.id.clone(), conn.clone());
                    }
                }

                let mut merged_connections: Vec<DeviceConnection> =
                    conn_map.into_values().collect();
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
                // Preserve favorite from either record
                existing.favorite = existing.favorite || device.favorite;

                if device_connected {
                    let _ = save_device_impl(existing.clone()).await;
                }
            } else {
                hw_map.insert(key, device);
            }
        }

        // Persistence is explicit: the connect flow saves devices after the user selects
        // them. Resolving live ADB state must not make a device disappear from that flow.
        let mut result: Vec<Device> = hw_map.into_values().collect();
        result.retain(|d| d.status != DeviceStatus::Offline || d.favorite);
        Ok(result)
    }

    pub async fn forget_device(
        &self,
        adb_path: PathBuf,
        device_id: String,
    ) -> Result<bool, String> {
        let devices = self.get_resolved_devices(adb_path.clone()).await?;
        let saved = get_saved_devices_impl().await.unwrap_or_default();
        let device_opt = devices
            .iter()
            .chain(saved.iter())
            .find(|d| d.id == device_id || d.hardware_id == device_id);


        if let Some(device) = device_opt {
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
                let _ = remove_saved_device_impl(id.clone()).await;
                if let Ok(w_dir) = get_wallpapers_dir_path() {
                    let key = wallpaper_cache_key(&id);
                    let _ = fs::remove_file(w_dir.join(format!("{}.png", key)));
                }
            }

            Ok(true)
        } else {
            let _ = remove_saved_device_impl(device_id.clone()).await;
            if let Ok(w_dir) = get_wallpapers_dir_path() {
                let key = wallpaper_cache_key(&device_id);
                let _ = fs::remove_file(w_dir.join(format!("{}.png", key)));
            }
            if device_id.contains(':') {
                let _ = disconnect_device_impl(adb_path, device_id).await;
            }
            Ok(false)
        }
    }
}
