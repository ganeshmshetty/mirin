/// Integration tests for ADB failure and edge-case scenarios.
///
/// Each test creates a fresh tempdir, writes a tailored mock ADB shell script,
/// and verifies that the Adb wrapper behaves correctly under adversarial conditions.

use std::fs::{self, File};
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use tempfile::tempdir;
use mirin_core::adb::Adb;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Write `content` to `<dir>/adb`, chmod 755, and return an `Adb` instance.
fn make_mock_adb(dir: &std::path::Path, content: &str) -> Adb {
    let path = dir.join("adb");
    {
        let mut f = File::create(&path).unwrap();
        f.write_all(content.as_bytes()).unwrap();
    }
    let mut perms = fs::metadata(&path).unwrap().permissions();
    perms.set_mode(0o755);
    fs::set_permissions(&path, perms).unwrap();
    Adb::new(path)
}

// ---------------------------------------------------------------------------
// Test 1 – connect exits 0 but prints "Connection refused" in stdout
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_connect_refused() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
echo "error: cannot connect to 192.168.1.50:5555: Connection refused"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.connect("192.168.1.50", 5555).await;
    assert!(result.is_ok(), "Expected Ok(_) because exit code is 0, got: {:?}", result);
    let msg = result.unwrap();
    assert!(msg.contains("Connection refused"), "Expected 'Connection refused' in stdout, got: {:?}", msg);
}

// ---------------------------------------------------------------------------
// Test 2 – connect already connected
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_connect_already_connected() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
echo "already connected to 10.0.0.5:5555"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.connect("10.0.0.5", 5555).await;
    assert!(result.is_ok(), "Expected Ok, got: {:?}", result);
    assert!(result.unwrap().contains("already connected"));
}

// ---------------------------------------------------------------------------
// Test 3 – pair with wrong code → exit 1 + stderr
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_pair_wrong_code() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
echo "Failed to pair with device: enter a valid 6-digit pairing code" >&2
exit 1
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.pair("192.168.1.5", 37263, "999999").await;
    assert!(result.is_err(), "Expected Err for wrong pairing code, got: {:?}", result);
    let err = result.unwrap_err();
    assert!(
        err.contains("pairing code") || err.contains("Failed to pair") || err.contains("ADB command failed"),
        "Expected pairing-code error, got: {:?}", err
    );
}

// ---------------------------------------------------------------------------
// Test 4 – pair success
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_pair_success() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
echo "Successfully paired to 192.168.1.5:37263 [GUID=adb-abc123-XYZ]"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.pair("192.168.1.5", 37263, "123456").await;
    assert!(result.is_ok(), "Expected Ok for successful pair, got: {:?}", result);
    assert!(result.unwrap().contains("Successfully paired"));
}

// ---------------------------------------------------------------------------
// Test 5 – devices with state "unauthorized"
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_devices_unauthorized() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    devices)
        echo "List of devices attached"
        printf "SERIAL_UNAUTH\tunauthorized transport_id:1\n"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let devices = adb.devices().await.unwrap();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].serial, "SERIAL_UNAUTH");
    assert_eq!(devices[0].state, "unauthorized");
}

// ---------------------------------------------------------------------------
// Test 6 – devices with state "offline"
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_devices_offline() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    devices)
        echo "List of devices attached"
        echo "192.168.1.77:5555	offline"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let devices = adb.devices().await.unwrap();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].serial, "192.168.1.77:5555");
    assert_eq!(devices[0].state, "offline");
}

// ---------------------------------------------------------------------------
// Test 7 – devices empty (only header line)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_devices_empty() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    devices)
        echo "List of devices attached"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let devices = adb.devices().await.unwrap();
    assert!(devices.is_empty(), "Expected empty devices list, got: {:?}", devices);
}

// ---------------------------------------------------------------------------
// Test 8 – mdns services empty (only header)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_mdns_services_empty() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    mdns)
        echo "List of discovered mDNS services"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let services = adb.get_mdns_services().await.unwrap();
    assert!(services.is_empty(), "Expected empty mDNS services list");
}

// ---------------------------------------------------------------------------
// Test 9 – mdns services parsed correctly (both connect and pairing lines)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_mdns_services_parsed() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    mdns)
        echo "List of discovered mDNS services"
        echo "pixel_7	_adb-tls-connect._tcp.	192.168.1.100:40001"
        echo "pixel_7_pair	_adb-tls-pairing._tcp.	192.168.1.100:40002"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let services = adb.get_mdns_services().await.unwrap();
    assert_eq!(services.len(), 2, "Expected 2 mDNS services, got: {:?}", services);

    let connect = services.iter().find(|s| s.service_type.contains("tls-connect"));
    assert!(connect.is_some(), "Expected a tls-connect service");
    let connect = connect.unwrap();
    assert_eq!(connect.instance_name, "pixel_7");
    assert_eq!(connect.address, "192.168.1.100:40001");

    let pairing = services.iter().find(|s| s.service_type.contains("tls-pairing"));
    assert!(pairing.is_some(), "Expected a tls-pairing service");
    let pairing = pairing.unwrap();
    assert_eq!(pairing.instance_name, "pixel_7_pair");
    assert_eq!(pairing.address, "192.168.1.100:40002");
}

// ---------------------------------------------------------------------------
// Test 10 – ip route: wlan0 interface → WiFi IP extracted
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_ip_route_wifi_iface() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
if [ "$1" = "-s" ]; then shift 2; fi
echo "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.42.100"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let ip = adb.get_device_ip(Some("SERIAL123")).await.unwrap();
    assert_eq!(ip, "192.168.42.100");
}

// ---------------------------------------------------------------------------
// Test 11 – ip route: no wifi iface → fallback extracts from eth0
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_ip_route_no_wifi_fallback() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
if [ "$1" = "-s" ]; then shift 2; fi
echo "10.10.0.0/16 dev eth0 proto kernel scope link src 10.10.1.55"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let ip = adb.get_device_ip(Some("ETH_SERIAL")).await.unwrap();
    assert_eq!(ip, "10.10.1.55");
}

// ---------------------------------------------------------------------------
// Test 12 – ip route only localhost → get_device_ip returns Err
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_ip_route_localhost_skipped() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
if [ "$1" = "-s" ]; then shift 2; fi
echo "127.0.0.0/8 dev lo proto kernel scope link src 127.0.0.1"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.get_device_ip(Some("LOCALHOST_ONLY")).await;
    assert!(result.is_err(), "Expected Err when only localhost IP present, got: {:?}", result);
    let err = result.unwrap_err();
    assert!(
        err.contains("Could not determine device IP") || err.contains("WiFi"),
        "Expected informative error, got: {:?}", err
    );
}

// ---------------------------------------------------------------------------
// Test 13 – disconnect success
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_disconnect_success() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
echo "disconnected 192.168.1.5:5555"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.disconnect("192.168.1.5:5555").await;
    assert!(result.is_ok(), "Expected Ok for disconnect, got: {:?}", result);
    assert!(result.unwrap().contains("disconnected"));
}

// ---------------------------------------------------------------------------
// Test 14 – nonexistent ADB binary → descriptive Err
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_adb_nonexistent_path() {
    let adb = Adb::new(std::path::PathBuf::from(
        "/tmp/definitely_not_an_adb_binary_xyz_mirin_test",
    ));
    let result = adb.execute(&["version"]).await;
    assert!(result.is_err(), "Expected Err for missing binary");
    assert!(
        result.unwrap_err().contains("Failed to execute ADB command"),
        "Expected 'Failed to execute ADB command'"
    );
}

// ---------------------------------------------------------------------------
// Test 15 – start_server → Ok(())
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_start_server() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.start_server().await;
    assert!(result.is_ok(), "Expected Ok(()) for start-server, got: {:?}", result);
}

// ---------------------------------------------------------------------------
// Test 16 – mdns: malformed address (no colon) is filtered out
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_mdns_services_malformed_address_filtered() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    mdns)
        echo "List of discovered mDNS services"
        echo "device_x	_adb-tls-connect._tcp.	no-colon-here"
        echo "device_y	_adb-tls-connect._tcp.	192.168.1.1:5555"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let services = adb.get_mdns_services().await.unwrap();
    assert_eq!(services.len(), 1, "Expected 1 service (malformed address filtered)");
    assert_eq!(services[0].instance_name, "device_y");
}

// ---------------------------------------------------------------------------
// Test 17 – mdns: non-_adb service type filtered out
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_mdns_services_non_adb_type_filtered() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    mdns)
        echo "List of discovered mDNS services"
        echo "some_printer	_ipp._tcp.	192.168.1.200:631"
        echo "pixel_8	_adb-tls-connect._tcp.	192.168.1.5:41000"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let services = adb.get_mdns_services().await.unwrap();
    assert_eq!(services.len(), 1, "Expected only the _adb service");
    assert_eq!(services[0].instance_name, "pixel_8");
}

// ---------------------------------------------------------------------------
// Test 18 – non-zero exit propagates stderr
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_execute_nonzero_exit_propagates_stderr() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
echo "error: device 'ghost' not found" >&2
exit 1
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.execute(&["shell", "echo", "hi"]).await;
    assert!(result.is_err(), "Expected Err for non-zero exit");
    let err = result.unwrap_err();
    assert!(
        err.contains("ADB command failed") || err.contains("not found"),
        "Expected ADB command failed message, got: {:?}", err
    );
}

// ---------------------------------------------------------------------------
// Test 19 – devices list with mixed states parsed individually
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_devices_mixed_states() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
case "$1" in
    start-server) exit 0 ;;
    devices)
        echo "List of devices attached"
        echo "USB123	device product:Pixel model:Pixel_8 device:D transport_id:1"
        echo "192.168.5.5:5555	offline"
        echo "USB_UNAUTH	unauthorized transport_id:3"
        ;;
    *) exit 0 ;;
esac
"#;
    let adb = make_mock_adb(dir.path(), script);
    let devices = adb.devices().await.unwrap();
    assert_eq!(devices.len(), 3);

    let usb = devices.iter().find(|d| d.serial == "USB123").expect("USB123 not found");
    assert_eq!(usb.state, "device");

    let wireless = devices.iter().find(|d| d.serial == "192.168.5.5:5555").expect("wireless not found");
    assert_eq!(wireless.state, "offline");

    let unauth = devices.iter().find(|d| d.serial == "USB_UNAUTH").expect("unauthorized not found");
    assert_eq!(unauth.state, "unauthorized");
}

// ---------------------------------------------------------------------------
// Test 20 – ip route with link-local address (169.254.x) → Err
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_ip_route_link_local_skipped() {
    let dir = tempdir().unwrap();
    let script = r#"#!/bin/sh
if [ "$1" = "-s" ]; then shift 2; fi
echo "169.254.0.0/16 dev usb0 proto kernel scope link src 169.254.0.1"
exit 0
"#;
    let adb = make_mock_adb(dir.path(), script);
    let result = adb.get_device_ip(Some("LINK_LOCAL")).await;
    assert!(result.is_err(), "Expected Err when only link-local IP exists, got: {:?}", result);
}

// ---------------------------------------------------------------------------
// Test 21 – socket execution: host command mock exchange
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_adb_socket_execution_success() {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    // 1. Bind to a random local port
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    // 2. Spawn a background mock TCP server to simulate the ADB protocol
    let server_task = tokio::spawn(async move {
        // Handle client connection
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = [0u8; 1024];

        // First expected request: host:devices-l
        let bytes_read = socket.read(&mut buf).await.unwrap();
        let req = String::from_utf8_lossy(&buf[..bytes_read]);
        assert!(req.contains("host:devices-l"));

        // Respond with OKAY followed by response length (4 hex) and data
        let response_data = "List of devices attached\ndevice123          device product:mock model:mock_phone\n";
        let hex_len = format!("{:04x}", response_data.len());
        socket.write_all(b"OKAY").await.unwrap();
        socket.write_all(hex_len.as_bytes()).await.unwrap();
        socket.write_all(response_data.as_bytes()).await.unwrap();
        socket.flush().await.unwrap();
    });

    // 3. Create Adb wrapper pointing to the custom port
    let dummy_path = std::path::PathBuf::from("/bin/true");
    let adb = Adb::new(dummy_path).with_port(port);

    // 4. Execute the command and assert
    let devices = adb.devices().await;
    assert!(devices.is_ok(), "Failed to get devices: {:?}", devices);
    let dev_list = devices.unwrap();
    assert_eq!(dev_list.len(), 1);
    assert_eq!(dev_list[0].serial, "device123");

    server_task.await.unwrap();
}

// ---------------------------------------------------------------------------
// Test 22 – socket execution: device transport command mock exchange
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_adb_socket_device_command_success() {
    use tokio::net::TcpListener;
    use tokio::io::{AsyncReadExt, AsyncWriteExt};

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let server_task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        let mut buf = [0u8; 1024];

        // Step 1: expect transport route: "0018host:transport:SERIAL123"
        let bytes_read = socket.read(&mut buf).await.unwrap();
        let req = String::from_utf8_lossy(&buf[..bytes_read]);
        assert!(req.contains("host:transport:SERIAL123"), "Expected host:transport request, got: {}", req);
        socket.write_all(b"OKAY").await.unwrap();
        socket.flush().await.unwrap();

        // Step 2: expect device command: "exec:getprop ro.product.model"
        let bytes_read = socket.read(&mut buf).await.unwrap();
        let req = String::from_utf8_lossy(&buf[..bytes_read]);
        assert!(req.contains("exec:getprop ro.product.model"), "Expected exec getprop, got: {}", req);
        
        socket.write_all(b"OKAY").await.unwrap();
        socket.write_all(b"Pixel 8 PRO\n").await.unwrap();
        socket.flush().await.unwrap();
    });

    let dummy_path = std::path::PathBuf::from("/bin/true");
    let adb = Adb::new(dummy_path).with_device("SERIAL123").with_port(port);

    let model = adb.get_model(Some("SERIAL123")).await;
    assert!(model.is_ok(), "Failed to get model: {:?}", model);
    assert_eq!(model.unwrap(), "Pixel 8 PRO");

    server_task.await.unwrap();
}
