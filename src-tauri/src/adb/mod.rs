use std::process::Command;
use std::path::PathBuf;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    pub product: Option<String>,
    pub model: Option<String>,
    pub device: Option<String>,
    pub transport_id: Option<String>,
}

/// ADB wrapper for executing commands and parsing output
pub struct Adb {
    adb_path: PathBuf,
}

impl Adb {
    /// Create a new ADB instance with the given executable path
    pub fn new(adb_path: PathBuf) -> Self {
        Self { adb_path }
    }

    /// Execute an ADB command and return the output
    fn execute(&self, args: &[&str]) -> Result<String, String> {
        let output = Command::new(&self.adb_path)
            .args(args)
            .output()
            .map_err(|e| format!("Failed to execute ADB command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ADB command failed: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    }

    /// Get the ADB version
    pub fn version(&self) -> Result<String, String> {
        self.execute(&["version"])
    }

    /// Start the ADB server
    pub fn start_server(&self) -> Result<(), String> {
        self.execute(&["start-server"])?;
        Ok(())
    }

    /// Kill the ADB server
    pub fn kill_server(&self) -> Result<(), String> {
        self.execute(&["kill-server"])?;
        Ok(())
    }

    /// List all connected devices
    pub fn devices(&self) -> Result<Vec<AdbDevice>, String> {
        let output = self.execute(&["devices", "-l"])?;
        self.parse_devices(&output)
    }

    /// Parse the output of `adb devices -l`
    fn parse_devices(&self, output: &str) -> Result<Vec<AdbDevice>, String> {
        let mut devices = Vec::new();

        for line in output.lines().skip(1) {
            // Skip the header line "List of devices attached"
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() < 2 {
                continue;
            }

            let serial = parts[0].to_string();
            let state = parts[1].to_string();

            // Parse additional device info (product, model, device, transport_id)
            let mut product = None;
            let mut model = None;
            let mut device = None;
            let mut transport_id = None;

            for part in parts.iter().skip(2) {
                if let Some((key, value)) = part.split_once(':') {
                    match key {
                        "product" => product = Some(value.to_string()),
                        "model" => model = Some(value.to_string()),
                        "device" => device = Some(value.to_string()),
                        "transport_id" => transport_id = Some(value.to_string()),
                        _ => {}
                    }
                }
            }

            devices.push(AdbDevice {
                serial,
                state,
                product,
                model,
                device,
                transport_id,
            });
        }

        Ok(devices)
    }

    /// Connect to a device wirelessly
    pub fn connect(&self, ip: &str, port: u16) -> Result<String, String> {
        let address = format!("{}:{}", ip, port);
        self.execute(&["connect", &address])
    }

    /// Disconnect from a specific device
    pub fn disconnect(&self, address: &str) -> Result<String, String> {
        self.execute(&["disconnect", address])
    }

    /// Disconnect from all devices
    pub fn disconnect_all(&self) -> Result<String, String> {
        self.execute(&["disconnect"])
    }

    /// Enable TCP/IP mode on a device (requires USB connection first)
    pub fn tcpip(&self, device_serial: Option<&str>, port: u16) -> Result<String, String> {
        let port_str = port.to_string();
        let args = if let Some(serial) = device_serial {
            vec!["-s", serial, "tcpip", &port_str]
        } else {
            vec!["tcpip", &port_str]
        };
        self.execute(&args)
    }

    /// Get device IP address (for wireless connection)
    pub fn get_device_ip(&self, device_serial: Option<&str>) -> Result<String, String> {
        let args = if let Some(serial) = device_serial {
            vec!["-s", serial, "shell", "ip", "route"]
        } else {
            vec!["shell", "ip", "route"]
        };

        let output = self.execute(&args)?;
        
        // Parse the IP address from the output
        // Looking for lines like: "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.100"
        for line in output.lines() {
            if line.contains("wlan") {
                if let Some(src_pos) = line.find("src ") {
                    let ip_start = src_pos + 4;
                    let ip_part = &line[ip_start..];
                    if let Some(ip_end) = ip_part.find(' ') {
                        return Ok(ip_part[..ip_end].trim().to_string());
                    } else {
                        return Ok(ip_part.trim().to_string());
                    }
                }
            }
        }

        Err("Could not determine device IP address".to_string())
    }

    /// Execute a shell command on a device
    pub fn shell(&self, device_serial: Option<&str>, command: &str) -> Result<String, String> {
        let args = if let Some(serial) = device_serial {
            vec!["-s", serial, "shell", command]
        } else {
            vec!["shell", command]
        };
        self.execute(&args)
    }

    /// Get device properties
    pub fn get_prop(&self, device_serial: Option<&str>, property: &str) -> Result<String, String> {
        let command = format!("getprop {}", property);
        let result = self.shell(device_serial, &command)?;
        Ok(result.trim().to_string())
    }

    /// Get device model name
    pub fn get_model(&self, device_serial: Option<&str>) -> Result<String, String> {
        self.get_prop(device_serial, "ro.product.model")
    }

    /// Get device manufacturer
    pub fn get_manufacturer(&self, device_serial: Option<&str>) -> Result<String, String> {
        self.get_prop(device_serial, "ro.product.manufacturer")
    }

    /// Get Android version
    pub fn get_android_version(&self, device_serial: Option<&str>) -> Result<String, String> {
        self.get_prop(device_serial, "ro.build.version.release")
    }

    /// Check if ADB is accessible and working
    pub fn check_availability(&self) -> Result<bool, String> {
        match self.version() {
            Ok(_) => Ok(true),
            Err(e) => Err(format!("ADB not available: {}", e)),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_devices() {
        let adb = Adb::new(PathBuf::from("adb.exe"));
        let output = r#"List of devices attached
emulator-5554          device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64 device:emu64a transport_id:1
192.168.1.100:5555     device product:OnePlus9 model:LE2115 device:OnePlus9 transport_id:2
"#;
        
        let devices = adb.parse_devices(output).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].serial, "emulator-5554");
        assert_eq!(devices[0].state, "device");
        assert_eq!(devices[1].serial, "192.168.1.100:5555");
    }
}
