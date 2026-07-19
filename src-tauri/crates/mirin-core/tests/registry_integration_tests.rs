use mirin_core::device_registry::{
    get_saved_devices_impl, remove_saved_device_impl, save_device_impl, ConnectionType, Device,
    DeviceConnection, DeviceStatus,
};
use std::env;
use tempfile::tempdir;

#[tokio::test]
async fn test_device_registry_file_integration() {
    // 1. Create a temp directory and point HOME / XDG_CONFIG_HOME to it
    let dir = tempdir().unwrap();
    let temp_path = dir.path().to_path_buf();

    // Set environment variables for the current thread/process
    env::set_var("HOME", &temp_path);
    env::set_var("XDG_CONFIG_HOME", &temp_path);

    // Verify initial saved devices is empty
    let initial = get_saved_devices_impl().await.unwrap();
    assert!(initial.is_empty());

    // 2. Save a mock device
    let dev = Device {
        id: "serial_usb_123".to_string(),
        hardware_id: "hw_id_abc".to_string(),
        name: "Test Phone".to_string(),
        model: "Pixel 8".to_string(),
        connection_type: ConnectionType::Usb,
        status: DeviceStatus::Connected,
        ip_address: None,
        connections: vec![DeviceConnection {
            id: "serial_usb_123".to_string(),
            connection_type: ConnectionType::Usb,
            status: DeviceStatus::Connected,
            ip_address: None,
            port: None,
        }],
    };

    let saved = save_device_impl(dev.clone()).await.unwrap();
    assert!(saved);

    // Verify it was saved to the temp config directory
    let saved_list = get_saved_devices_impl().await.unwrap();
    assert_eq!(saved_list.len(), 1);
    assert_eq!(saved_list[0].id, "serial_usb_123");
    assert_eq!(saved_list[0].name, "Test Phone");

    // 3. Remove the saved device
    let removed = remove_saved_device_impl("serial_usb_123".to_string())
        .await
        .unwrap();
    assert!(removed);

    // Verify list is now empty again
    let final_list = get_saved_devices_impl().await.unwrap();
    assert!(final_list.is_empty());
}
