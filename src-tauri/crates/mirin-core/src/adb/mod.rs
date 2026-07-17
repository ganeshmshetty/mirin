use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    pub product: Option<String>,
    pub model: Option<String>,
    pub device: Option<String>,
    pub transport_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MdnsService {
    pub instance_name: String,
    pub service_type: String,
    pub address: String, // format: ip:port
}

/// ADB wrapper for executing commands and parsing output
#[derive(Clone)]
pub struct Adb {
    adb_path: PathBuf,
    transport_id: Option<String>,
}

impl Adb {
    /// Create a new ADB instance with the given executable path
    pub fn new(adb_path: PathBuf) -> Self {
        Self {
            adb_path,
            transport_id: None,
        }
    }

    /// Return a new Adb instance targeted at a specific device serial (`-s <serial>`)
    pub fn with_device(&self, serial: &str) -> Self {
        let mut clone = self.clone();
        clone.transport_id = Some(serial.to_string());
        clone
    }

    /// Raw execution helper
    async fn execute_raw(&self, args: &[&str]) -> Result<String, String> {
        let mut std_cmd = std::process::Command::new(&self.adb_path);

        if let Some(ref id) = self.transport_id {
            std_cmd.arg("-s").arg(id);
        }

        std_cmd.args(args);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            std_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut command = tokio::process::Command::from(std_cmd);

        // Wrap execution in a timeout (e.g., 10 seconds) to prevent hanging
        let output_result =
            tokio::time::timeout(std::time::Duration::from_secs(10), command.output()).await;

        let output = match output_result {
            Ok(Ok(out)) => out,
            Ok(Err(e)) => return Err(format!("Failed to execute ADB command: {}", e)),
            Err(_) => return Err("ADB command timed out".to_string()),
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ADB command failed: {}", stderr.trim()));
        }

        let stdout = String::from_utf8_lossy(&output.stdout).to_string();
        Ok(stdout)
    }

    /// Execute an ADB command and return the output asynchronously (with self-healing fallback)
    pub async fn execute(&self, args: &[&str]) -> Result<String, String> {
        let res = self.execute_raw(args).await;

        if let Err(ref e) = res {
            // Avoid retrying if the command was already a server control command to prevent recursion
            let is_control_cmd = args
                .iter()
                .any(|&arg| arg == "kill-server" || arg == "start-server");
            let is_daemon_error = e.contains("could not connect to daemon")
                || e.contains("daemon not running")
                || e.contains("cannot connect to daemon")
                || e.contains("ADB server didn't ACK")
                || e.contains("timed out")
                || e.contains("connection refused");

            // Only restart daemon if ADB server crashed, NOT when a regular command exits non-zero
            if !is_control_cmd && is_daemon_error {
                println!("ADB daemon error ({:?}): {}. Restarting daemon...", args, e);
                let _ = self.execute_raw(&["kill-server"]).await;
                let _ = self.execute_raw(&["start-server"]).await;
                return self.execute_raw(args).await;
            }
        }
        res
    }

    /// Raw execution helper returning raw byte output
    async fn execute_bytes_raw(&self, args: &[&str]) -> Result<Vec<u8>, String> {
        let mut std_cmd = std::process::Command::new(&self.adb_path);
        if let Some(ref id) = self.transport_id {
            std_cmd.arg("-s").arg(id);
        }
        std_cmd.args(args);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            std_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut command = tokio::process::Command::from(std_cmd);
        let output_result =
            tokio::time::timeout(std::time::Duration::from_secs(10), command.output()).await;

        let output = match output_result {
            Ok(Ok(out)) => out,
            Ok(Err(e)) => return Err(format!("Failed to execute ADB command: {}", e)),
            Err(_) => return Err("ADB command timed out".to_string()),
        };

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ADB command failed: {}", stderr.trim()));
        }

        Ok(output.stdout)
    }

    /// Execute an ADB command and return the raw output bytes (with self-healing fallback)
    pub async fn execute_bytes(&self, args: &[&str]) -> Result<Vec<u8>, String> {
        let res = self.execute_bytes_raw(args).await;
        if let Err(ref e) = res {
            let is_control_cmd = args
                .iter()
                .any(|&arg| arg == "kill-server" || arg == "start-server");
            let is_daemon_error = e.contains("could not connect to daemon")
                || e.contains("daemon not running")
                || e.contains("cannot connect to daemon")
                || e.contains("ADB server didn't ACK")
                || e.contains("timed out")
                || e.contains("connection refused");
            if !is_control_cmd && is_daemon_error {
                println!("ADB daemon error ({:?}): {}. Restarting daemon...", args, e);
                let _ = self.execute_raw(&["kill-server"]).await;
                let _ = self.execute_raw(&["start-server"]).await;
                return self.execute_bytes_raw(args).await;
            }
        }
        res
    }

    /// Get the ADB version
    #[allow(dead_code)]
    pub async fn version(&self) -> Result<String, String> {
        self.execute(&["version"]).await
    }

    /// Start the ADB server
    pub async fn start_server(&self) -> Result<(), String> {
        self.execute(&["start-server"]).await?;
        Ok(())
    }

    /// Kill the ADB server
    #[allow(dead_code)]
    pub async fn kill_server(&self) -> Result<(), String> {
        self.execute(&["kill-server"]).await?;
        Ok(())
    }

    /// List all connected devices
    pub async fn devices(&self) -> Result<Vec<AdbDevice>, String> {
        let output = self.execute(&["devices", "-l"]).await?;
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

    /// Discover mDNS services (Android 11+)
    pub async fn get_mdns_services(&self) -> Result<Vec<MdnsService>, String> {
        let output = self.execute(&["mdns", "services"]).await?;

        let mut services = Vec::new();
        let lines: Vec<&str> = output.lines().collect();

        // Skip the first line which is usually "List of discovered mDNS services"
        for line in lines.iter().skip(1) {
            let line = line.trim();
            if line.is_empty() {
                continue;
            }

            // Format: instance_name service_type address
            // e.g. "pixel_7    _adb-tls-pairing._tcp.    192.168.1.100:38475"
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let address = parts[parts.len() - 1].to_string();
                let service_type = parts[parts.len() - 2].to_string();
                let instance_name = parts[..parts.len() - 2].join(" ");

                // Tighten parsing: ensure it's an ADB service and address looks like IP:Port
                if service_type.contains("_adb") && address.contains(':') {
                    services.push(MdnsService {
                        instance_name,
                        service_type,
                        address,
                    });
                }
            }
        }

        Ok(services)
    }

    /// Connect to a device wirelessly
    pub async fn connect(&self, ip: &str, port: u16) -> Result<String, String> {
        let address = format!("{}:{}", ip, port);
        self.execute(&["connect", &address]).await
    }

    /// Pair with a device wirelessly (Android 11+)
    pub async fn pair(&self, ip: &str, port: u16, pairing_code: &str) -> Result<String, String> {
        let address = format!("{}:{}", ip, port);
        self.execute(&["pair", &address, pairing_code]).await
    }

    /// Disconnect from a specific device
    pub async fn disconnect(&self, address: &str) -> Result<String, String> {
        self.execute(&["disconnect", address]).await
    }

    /// Disconnect from all devices
    #[allow(dead_code)]
    pub async fn disconnect_all(&self) -> Result<String, String> {
        self.execute(&["disconnect"]).await
    }

    /// Enable TCP/IP mode on a device (requires USB connection first)
    pub async fn tcpip(&self, device_serial: Option<&str>, port: u16) -> Result<String, String> {
        let port_str = port.to_string();
        let args = if let Some(serial) = device_serial {
            vec!["-s", serial, "tcpip", &port_str]
        } else {
            vec!["tcpip", &port_str]
        };
        self.execute(&args).await
    }

    /// Get device IP address (for wireless connection)
    pub async fn get_device_ip(&self, device_serial: Option<&str>) -> Result<String, String> {
        let args = if let Some(serial) = device_serial {
            vec!["-s", serial, "shell", "ip", "route"]
        } else {
            vec!["shell", "ip", "route"]
        };

        let output = self.execute(&args).await?;
        self.parse_ip_route(&output)
    }

    /// Parse the output of `ip route` to find the device IP
    fn parse_ip_route(&self, output: &str) -> Result<String, String> {
        // Parse the IP address from the output
        // Looking for lines like: "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.100"
        // Some devices use different interface names: wlan0, wlan1, wifi0, etc.

        // First try to find WiFi interface
        for line in output.lines() {
            let line_lower = line.to_lowercase();
            if line_lower.contains("wlan") || line_lower.contains("wifi") {
                if let Some(ip) = self.extract_src_ip(line) {
                    return Ok(ip);
                }
            }
        }

        // Fallback: look for any "src" IP that's not localhost
        for line in output.lines() {
            if let Some(ip) = self.extract_src_ip(line) {
                // Skip localhost and link-local addresses
                if !ip.starts_with("127.") && !ip.starts_with("169.254.") {
                    return Ok(ip);
                }
            }
        }

        Err(
            "Could not determine device IP address. Make sure the device is connected to WiFi."
                .to_string(),
        )
    }

    /// Extract the source IP from an ip route line
    fn extract_src_ip(&self, line: &str) -> Option<String> {
        if let Some(src_pos) = line.find("src ") {
            let ip_start = src_pos + 4;
            let ip_part = &line[ip_start..];
            if let Some(ip_end) = ip_part.find(' ') {
                return Some(ip_part[..ip_end].trim().to_string());
            } else {
                return Some(ip_part.trim().to_string());
            }
        }
        None
    }

    /// Execute a shell command on a device
    pub async fn shell(
        &self,
        device_serial: Option<&str>,
        command: &str,
    ) -> Result<String, String> {
        let args = if let Some(serial) = device_serial {
            vec!["-s", serial, "shell", command]
        } else {
            vec!["shell", command]
        };
        self.execute(&args).await
    }

    /// Get device properties
    pub async fn get_prop(
        &self,
        device_serial: Option<&str>,
        property: &str,
    ) -> Result<String, String> {
        let command = format!("getprop {}", property);
        let result = self.shell(device_serial, &command).await?;
        Ok(result.trim().to_string())
    }

    /// Get device model name
    pub async fn get_model(&self, device_serial: Option<&str>) -> Result<String, String> {
        self.get_prop(device_serial, "ro.product.model").await
    }

    /// Get device manufacturer
    #[allow(dead_code)]
    pub async fn get_manufacturer(&self, device_serial: Option<&str>) -> Result<String, String> {
        self.get_prop(device_serial, "ro.product.manufacturer")
            .await
    }

    /// Get Android version
    #[allow(dead_code)]
    pub async fn get_android_version(&self, device_serial: Option<&str>) -> Result<String, String> {
        self.get_prop(device_serial, "ro.build.version.release")
            .await
    }

    /// Enable wireless debugging and wait for the device to reconnect on IP
    pub async fn enable_wireless_mode_and_wait(&self, device_id: &str) -> Result<String, String> {
        let device_model = self.get_model(Some(device_id)).await.unwrap_or_default();

        let tcpip_result = self.tcpip(Some(device_id), 5555).await;
        if let Err(ref e) = tcpip_result {
            if e.contains("not found") {
                return Err(format!(
                    "Device '{}' not found. Please refresh the device list and try again.\n\
                    Make sure the device is connected via USB with debugging enabled.",
                    device_id
                ));
            }
        }
        tcpip_result?;

        let mut ip_address: Option<String> = None;
        for attempt in 0..5 {
            let wait_ms = if attempt == 0 { 1500 } else { 500 };
            tokio::time::sleep(std::time::Duration::from_millis(wait_ms)).await;

            if let Ok(devices) = self.devices().await {
                for dev in &devices {
                    if dev.serial.contains(':') {
                        continue;
                    }

                    if dev.serial == device_id
                        || dev
                            .model
                            .as_ref()
                            .map(|m| m == &device_model)
                            .unwrap_or(false)
                        || devices.len() == 1
                    {
                        if let Ok(ip) = self.get_device_ip(Some(&dev.serial)).await {
                            ip_address = Some(ip);
                            break;
                        }
                    }
                }
            }
            if ip_address.is_some() {
                break;
            }
        }

        match ip_address {
            Some(ip) => Ok(ip),
            None => Err("Wireless mode enabled but couldn't retrieve IP address.\n\
                Check your phone's WiFi settings for the IP address,\n\
                then use 'IP Connect' to connect wirelessly."
                .to_string()),
        }
    }

    /// Push a local file to a remote device path
    pub async fn push(
        &self,
        device_serial: &str,
        local_path: &str,
        remote_path: &str,
    ) -> Result<String, String> {
        let mut std_cmd = std::process::Command::new(&self.adb_path);
        if let Some(ref id) = self.transport_id {
            std_cmd.arg("-s").arg(id);
        } else {
            std_cmd.arg("-s").arg(device_serial);
        }
        std_cmd.args(&["push", local_path, remote_path]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            std_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        let mut command = tokio::process::Command::from(std_cmd);
        let output_result =
            tokio::time::timeout(std::time::Duration::from_secs(60), command.output()).await;

        let output = match output_result {
            Ok(Ok(out)) => out,
            Ok(Err(e)) => return Err(format!("Failed to execute ADB command: {}", e)),
            Err(_) => return Err("ADB command timed out".to_string()),
        };

        if !output.status.success() {
            let err = String::from_utf8_lossy(&output.stderr);
            return Err(format!("ADB error: {}", err));
        }

        Ok(String::from_utf8_lossy(&output.stdout).to_string())
    }

    /// Reverse port forwarding (Android device connects to local port)
    pub async fn reverse(
        &self,
        device_serial: &str,
        remote: &str,
        local_port: u16,
    ) -> Result<String, String> {
        if self.transport_id.is_some() {
            self.execute(&["reverse", remote, &format!("tcp:{}", local_port)])
                .await
        } else {
            self.execute(&[
                "-s",
                device_serial,
                "reverse",
                remote,
                &format!("tcp:{}", local_port),
            ])
            .await
        }
    }

    /// Remove reverse port forwarding
    pub async fn remove_reverse(
        &self,
        device_serial: &str,
        remote: &str,
    ) -> Result<String, String> {
        if self.transport_id.is_some() {
            let _ = self.execute_raw(&["reverse", "--remove", remote]).await;
        } else {
            let _ = self
                .execute_raw(&["-s", device_serial, "reverse", "--remove", remote])
                .await;
        }
        Ok("".to_string())
    }

    /// Remove port forwarding
    pub async fn remove_forward(
        &self,
        device_serial: &str,
        local_port: u16,
    ) -> Result<String, String> {
        if self.transport_id.is_some() {
            let _ = self
                .execute_raw(&["forward", "--remove", &format!("tcp:{}", local_port)])
                .await;
        } else {
            let _ = self
                .execute_raw(&[
                    "-s",
                    device_serial,
                    "forward",
                    "--remove",
                    &format!("tcp:{}", local_port),
                ])
                .await;
        }
        Ok("".to_string())
    }

    /// Kill any running scrcpy server on the remote device
    pub async fn kill_scrcpy_server(&self, device_serial: &str) {
        if self.transport_id.is_some() {
            let _ = self
                .execute_raw(&["shell", "pkill -f com.genymobile.scrcpy.Server"])
                .await;
        } else {
            let _ = self
                .execute_raw(&[
                    "-s",
                    device_serial,
                    "shell",
                    "pkill -f com.genymobile.scrcpy.Server",
                ])
                .await;
        }
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
    }

    /// Spawn a continuous shell command (returning child process without waiting)
    pub fn spawn_shell(
        &self,
        device_serial: &str,
        cmd: &str,
    ) -> Result<tokio::process::Child, String> {
        let mut std_cmd = std::process::Command::new(&self.adb_path);
        if let Some(ref id) = self.transport_id {
            std_cmd.arg("-s").arg(id);
        } else {
            std_cmd.arg("-s").arg(device_serial);
        }
        std_cmd.args(&["shell", cmd]);

        #[cfg(target_os = "windows")]
        {
            use std::os::windows::process::CommandExt;
            std_cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
        }

        std_cmd
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        tokio::process::Command::from(std_cmd)
            .spawn()
            .map_err(|e| format!("Failed to spawn shell child: {}", e))
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

    #[test]
    fn test_parse_usb_device() {
        let adb = Adb::new(PathBuf::from("adb.exe"));
        let output = "List of devices attached\nSERIAL123\tdevice product:P model:Pixel_6 device:D transport_id:1";

        let devices = adb.parse_devices(output).unwrap();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "SERIAL123");
        assert_eq!(devices[0].state, "device");
        assert_eq!(devices[0].model, Some("Pixel_6".to_string()));
    }

    #[test]
    fn test_parse_wireless_device() {
        let adb = Adb::new(PathBuf::from("adb.exe"));
        let output = "List of devices attached\n192.168.1.5:5555\tdevice product:P model:Galaxy_S21 device:D transport_id:2";

        let devices = adb.parse_devices(output).unwrap();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "192.168.1.5:5555");
        assert_eq!(devices[0].state, "device");
        assert_eq!(devices[0].model, Some("Galaxy_S21".to_string()));
    }

    #[test]
    fn test_parse_multiple_devices() {
        let adb = Adb::new(PathBuf::from("adb.exe"));
        let output = r#"List of devices attached
SERIAL123          device product:P model:Pixel_6 device:D transport_id:1
192.168.1.5:5555   device product:P model:Galaxy_S21 device:D transport_id:2
"#;

        let devices = adb.parse_devices(output).unwrap();
        assert_eq!(devices.len(), 2);
        assert_eq!(devices[0].serial, "SERIAL123");
        assert_eq!(devices[1].serial, "192.168.1.5:5555");
    }

    #[test]
    fn test_parse_unauthorized_device() {
        let adb = Adb::new(PathBuf::from("adb.exe"));
        let output = "List of devices attached\nSERIAL123\tunauthorized transport_id:1";

        let devices = adb.parse_devices(output).unwrap();
        assert_eq!(devices.len(), 1);
        assert_eq!(devices[0].serial, "SERIAL123");
        assert_eq!(devices[0].state, "unauthorized");
    }

    #[test]
    fn test_parse_ip_route() {
        let adb = Adb::new(PathBuf::from("adb.exe"));

        // Standard output format
        let output1 = "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.100";
        assert_eq!(adb.parse_ip_route(output1).unwrap(), "192.168.1.100");

        // Output with extra spaces or different order
        let output2 = "10.0.0.0/8 dev wlan0  src 10.0.0.50  uid 1000";
        assert_eq!(adb.parse_ip_route(output2).unwrap(), "10.0.0.50");

        // Output at end of line
        let output3 = "172.16.0.0/16 dev wlan0 scope link src 172.16.0.1";
        assert_eq!(adb.parse_ip_route(output3).unwrap(), "172.16.0.1");

        // Falls back to eth0 interface (or any non-wlan interface with src)
        let output4 = "192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.100";
        assert_eq!(adb.parse_ip_route(output4).unwrap(), "192.168.1.100");

        // No src field
        let output5 = "192.168.1.0/24 dev wlan0 proto kernel scope link";
        assert!(adb.parse_ip_route(output5).is_err());
    }

    #[tokio::test]
    async fn test_execute_failure() {
        // Point to a non-existent executable
        let adb = Adb::new(PathBuf::from("non_existent_adb_executable"));
        let result = adb.execute(&["version"]).await;
        assert!(result.is_err());
        assert!(result
            .unwrap_err()
            .contains("Failed to execute ADB command"));
    }

    #[test]
    fn test_parse_performance() {
        let adb = Adb::new(PathBuf::from("adb.exe"));

        // Generate a large output string simulating 1000 devices
        let mut output = String::from("List of devices attached\n");
        for i in 0..1000 {
            output.push_str(&format!(
                "device-{} device product:p model:m device:d transport_id:{}\n",
                i, i
            ));
        }

        let start = std::time::Instant::now();
        let devices = adb.parse_devices(&output).unwrap();
        let duration = start.elapsed();

        assert_eq!(devices.len(), 1000);
        // Parsing 1000 devices should be very fast (under 50ms)
        assert!(
            duration.as_millis() < 50,
            "Parsing took too long: {}ms",
            duration.as_millis()
        );
    }
}
