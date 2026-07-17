use mirin_core::adb::Adb;
use std::fs::{self, File};
use std::io::Write;
use std::os::unix::fs::PermissionsExt;
use tempfile::tempdir;

#[tokio::test]
async fn test_mock_adb_execution_integration() {
    // 1. Create a temp directory for mock ADB executable
    let dir = tempdir().unwrap();
    let mock_adb_path = dir.path().join("adb");

    // 2. Write a mock bash script simulating adb behavior
    let script_content = r#"#!/bin/sh
case "$1" in
    devices)
        echo "List of devices attached"
        echo "mock_serial_123	device product:mock_prod model:mock_model device:mock_dev transport_id:1"
        ;;
    -s)
        shift 2
        if [ "$1" = "shell" ]; then
            shift 1
            cmd="$*"
            case "$cmd" in
                "getprop ro.product.brand")
                    echo "Google"
                    ;;
                "getprop ro.product.model")
                    echo "Pixel 8"
                    ;;
                "ip route")
                    echo "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.150"
                    ;;
                *)
                    echo "unknown property or shell command: $cmd" >&2
                    exit 4
                    ;;
            esac
        else
            echo "unsupported serial sub-command: $1" >&2
            exit 2
        fi
        ;;
    shell)
        shift 1
        cmd="$*"
        if [ "$cmd" = "ip route" ]; then
            echo "192.168.1.0/24 dev wlan0 proto kernel scope link src 192.168.1.150"
        else
            echo "unknown shell command: $cmd" >&2
            exit 3
        fi
        ;;
    *)
        echo "unsupported adb command: $1" >&2
        exit 1
        ;;
esac
"#;

    {
        let mut file = File::create(&mock_adb_path).unwrap();
        file.write_all(script_content.as_bytes()).unwrap();
    }

    // Make the script executable
    let mut perms = fs::metadata(&mock_adb_path).unwrap().permissions();
    perms.set_mode(0o755); // Read-Write-Execute for Owner, Read-Execute for Group/Others
    fs::set_permissions(&mock_adb_path, perms).unwrap();

    // 3. Initialize Adb with the mock path
    let adb = Adb::new(mock_adb_path);

    // 4. Test calling `devices()`
    let devices = adb.devices().await.unwrap();
    assert_eq!(devices.len(), 1);
    assert_eq!(devices[0].serial, "mock_serial_123");
    assert_eq!(devices[0].state, "device");
    assert_eq!(devices[0].model.as_deref(), Some("mock_model"));

    // 5. Test calling `get_prop()`
    let brand = adb
        .get_prop(Some("mock_serial_123"), "ro.product.brand")
        .await
        .unwrap();
    assert_eq!(brand, "Google");

    let model = adb
        .get_prop(Some("mock_serial_123"), "ro.product.model")
        .await
        .unwrap();
    assert_eq!(model, "Pixel 8");

    // 6. Test parsing IP route via execution
    let ip = adb.get_device_ip(Some("mock_serial_123")).await.unwrap();
    assert_eq!(ip, "192.168.1.150");
}
