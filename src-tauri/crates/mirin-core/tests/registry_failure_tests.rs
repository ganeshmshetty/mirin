use mirin_core::device_registry::{
    get_saved_devices_impl, remove_saved_device_impl, save_device_impl, ConnectionType, Device,
    DeviceConnection, DeviceRegistry, DeviceStatus,
};
/// Integration tests for device registry failure and edge-case paths.
///
/// Registry tests that call save/get/remove must serialize access to the HOME
/// env var (which dirs::config_dir uses on macOS).  We use a global Mutex so
/// parallel test threads cannot clobber each other's temp directory pointer.
use std::env;
use std::fs;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tempfile::tempdir;


// ---------------------------------------------------------------------------
// Global lock – serialises every test that mutates env vars / filesystem
// ---------------------------------------------------------------------------
static ENV_LOCK: Mutex<()> = Mutex::new(());

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn make_device(id: &str, hw_id: &str, name: &str, conn_type: ConnectionType) -> Device {
    Device {
        id: id.to_string(),
        hardware_id: hw_id.to_string(),
        name: name.to_string(),
        model: "TestModel".to_string(),
        connection_type: conn_type.clone(),
        status: DeviceStatus::Connected,
        ip_address: None,
        connections: vec![DeviceConnection {
            id: id.to_string(),
            connection_type: conn_type,
            status: DeviceStatus::Connected,
            ip_address: None,
            port: None,
        }],
        favorite: false,
    }
}


/// On macOS, dirs::config_dir() uses $HOME/Library/Application Support.
/// On Linux it uses $XDG_CONFIG_HOME or $HOME/.config.
/// Pre-create all possible subdirectories under `dir` so that whichever
/// platform we are on, the mirin config dir will land inside `dir`.
fn redirect_config(dir: &Path) {
    env::set_var("HOME", dir);
    env::set_var("XDG_CONFIG_HOME", dir);
    // macOS: ~/Library/Application Support
    let _ = fs::create_dir_all(dir.join("Library").join("Application Support"));
}

// ---------------------------------------------------------------------------
// Test 1 – overwrite: same hardware_id → single entry, updated serial
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_save_and_overwrite_same_hardware_id() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    let dev1 = make_device("serial_X", "hw_A", "Phone", ConnectionType::Usb);
    save_device_impl(dev1).await.unwrap();

    let dev2 = make_device("serial_Y", "hw_A", "Phone v2", ConnectionType::Usb);
    save_device_impl(dev2).await.unwrap();

    let saved = get_saved_devices_impl().await.unwrap();
    assert_eq!(
        saved.len(),
        1,
        "Expected exactly 1 entry after overwrite, got: {}",
        saved.len()
    );
    assert_eq!(saved[0].id, "serial_Y", "Expected updated serial");
    assert_eq!(saved[0].hardware_id, "hw_A");
}

// ---------------------------------------------------------------------------
// Test 2 – remove nonexistent device → Ok(false)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_remove_nonexistent_device() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    // Ensure file exists with one real device
    save_device_impl(make_device(
        "real_device",
        "hw_real",
        "Phone",
        ConnectionType::Usb,
    ))
    .await
    .unwrap();

    let result = remove_saved_device_impl("ghost_id_that_was_never_saved".to_string()).await;
    assert!(result.is_ok(), "Expected Ok, got: {:?}", result);
    assert_eq!(
        result.unwrap(),
        false,
        "Expected Ok(false) for missing device"
    );
}

// ---------------------------------------------------------------------------
// Test 3 – remove by IP match (same IP, different port)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_remove_by_ip_match() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    let dev = make_device(
        "192.168.1.5:5555",
        "hw_ip",
        "Wireless Phone",
        ConnectionType::Wireless,
    );
    save_device_impl(dev).await.unwrap();

    // Remove using same IP but different port
    let result = remove_saved_device_impl("192.168.1.5:9999".to_string()).await;
    assert!(result.is_ok(), "Expected Ok");
    assert_eq!(
        result.unwrap(),
        true,
        "Expected Ok(true): device removed by IP match"
    );

    let remaining = get_saved_devices_impl().await.unwrap();
    assert!(
        remaining.is_empty(),
        "Expected empty list after IP-match removal"
    );
}

// ---------------------------------------------------------------------------
// Test 4 – save multiple devices → all returned
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_save_multiple_devices() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    for i in 0..3 {
        let dev = make_device(
            &format!("serial_{}", i),
            &format!("hw_{}", i),
            &format!("Device {}", i),
            ConnectionType::Usb,
        );
        save_device_impl(dev).await.unwrap();
    }

    let saved = get_saved_devices_impl().await.unwrap();
    assert_eq!(saved.len(), 3, "Expected 3 devices, got: {}", saved.len());
    for i in 0..3 {
        assert!(
            saved.iter().any(|d| d.hardware_id == format!("hw_{}", i)),
            "Device hw_{} not found",
            i
        );
    }
}

// ---------------------------------------------------------------------------
// Test 6 – corrupt JSON → graceful empty Vec (unwrap_or_default)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_corrupt_json_graceful() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    // Write corrupt JSON to all possible config sub-paths
    for relative in &[
        "mirin/saved_devices.json",
        "Library/Application Support/mirin/saved_devices.json",
    ] {
        let file_path = dir.path().join(relative);
        fs::create_dir_all(file_path.parent().unwrap()).unwrap();
        let mut f = fs::File::create(&file_path).unwrap();
        f.write_all(b"{ this is not valid JSON !!!").unwrap();
    }

    let result = get_saved_devices_impl().await;
    assert!(
        result.is_ok(),
        "Expected Ok even with corrupt JSON, got: {:?}",
        result
    );
    let devices = result.unwrap();
    assert!(devices.is_empty(), "Expected empty Vec from corrupt JSON");
}

// ---------------------------------------------------------------------------
// Test 7 – empty hardware_id → fallback to device.id
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_empty_hardware_id_fallback() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    let mut dev = make_device("my_serial_id", "", "No HW ID Phone", ConnectionType::Usb);
    dev.hardware_id = "".to_string();

    save_device_impl(dev).await.unwrap();

    let saved = get_saved_devices_impl().await.unwrap();
    assert_eq!(saved.len(), 1, "Expected 1 device, got: {}", saved.len());
    assert_eq!(
        saved[0].hardware_id, "my_serial_id",
        "Expected hardware_id == id, got: {:?}",
        saved[0].hardware_id
    );
}

// ---------------------------------------------------------------------------
// Test 8 – remove by hardware_id field
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_remove_by_hardware_id() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    let dev = make_device("serial_abc", "hw_real_123", "Pixel", ConnectionType::Usb);
    save_device_impl(dev).await.unwrap();

    let result = remove_saved_device_impl("hw_real_123".to_string()).await;
    assert!(result.is_ok(), "Expected Ok");
    assert_eq!(
        result.unwrap(),
        true,
        "Expected device removed by hardware_id"
    );

    let remaining = get_saved_devices_impl().await.unwrap();
    assert!(remaining.is_empty(), "Expected empty list");
}

// ---------------------------------------------------------------------------
// Test 9 – save USB and wireless separately → both retained, correct type
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_save_wireless_and_usb_separately() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    let usb_dev = make_device("USB_SERIAL_001", "hw_usb", "USB Phone", ConnectionType::Usb);
    let wireless_dev = make_device(
        "192.168.10.10:5555",
        "hw_wifi",
        "WiFi Phone",
        ConnectionType::Wireless,
    );

    save_device_impl(usb_dev).await.unwrap();
    save_device_impl(wireless_dev).await.unwrap();

    let saved = get_saved_devices_impl().await.unwrap();
    assert_eq!(saved.len(), 2, "Expected 2 devices, got: {}", saved.len());

    let usb = saved
        .iter()
        .find(|d| d.hardware_id == "hw_usb")
        .expect("USB device not found");
    assert_eq!(usb.connection_type, ConnectionType::Usb);

    let wifi = saved
        .iter()
        .find(|d| d.hardware_id == "hw_wifi")
        .expect("WiFi device not found");
    assert_eq!(wifi.connection_type, ConnectionType::Wireless);
    assert_eq!(wifi.id, "192.168.10.10:5555");
}

// ---------------------------------------------------------------------------
// Test 10 – overwrite replaces the name field
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_overwrite_preserves_name() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    let dev1 = make_device("serial_001", "hw_same", "My Pixel", ConnectionType::Usb);
    save_device_impl(dev1).await.unwrap();

    let dev2 = make_device("serial_001", "hw_same", "New Name", ConnectionType::Usb);
    save_device_impl(dev2).await.unwrap();

    let saved = get_saved_devices_impl().await.unwrap();
    assert_eq!(
        saved.len(),
        1,
        "Expected 1 device after overwrite, got: {}",
        saved.len()
    );
    assert_eq!(
        saved[0].name, "New Name",
        "Expected name overwritten to 'New Name'"
    );
}

// ---------------------------------------------------------------------------
// Test 11 – remove from empty registry (no file at all) → Ok(false)
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_remove_from_empty_registry_no_file() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    // No file written → remove_saved_device_impl returns Ok(false) immediately
    let result = remove_saved_device_impl("nonexistent".to_string()).await;
    assert!(result.is_ok(), "Expected Ok even when file doesn't exist");
    assert_eq!(
        result.unwrap(),
        false,
        "Expected Ok(false) when file is absent"
    );
}

// ---------------------------------------------------------------------------
// Test 12 – offline non-favorite devices are filtered out from get_resolved_devices
// ---------------------------------------------------------------------------
#[tokio::test]
async fn test_get_resolved_devices_filters_offline_non_favorites() {
    let _lock = ENV_LOCK.lock().unwrap();
    let dir = tempdir().unwrap();
    redirect_config(dir.path());

    let mut dev_normal = make_device("dev_normal", "hw_norm", "Normal Phone", ConnectionType::Usb);
    dev_normal.favorite = false;
    save_device_impl(dev_normal).await.unwrap();

    let mut dev_fav = make_device("dev_fav", "hw_fav", "Favorite Phone", ConnectionType::Usb);
    dev_fav.favorite = true;
    save_device_impl(dev_fav).await.unwrap();

    let saved = get_saved_devices_impl().await.unwrap();
    assert_eq!(saved.len(), 2);

    let registry = DeviceRegistry::new();
    let resolved = registry
        .get_resolved_devices(PathBuf::from("/nonexistent/adb"))
        .await
        .unwrap();

    assert_eq!(resolved.len(), 1, "Expected only the favorite device when offline");
    assert_eq!(resolved[0].id, "dev_fav");
    assert!(resolved[0].favorite);
}

