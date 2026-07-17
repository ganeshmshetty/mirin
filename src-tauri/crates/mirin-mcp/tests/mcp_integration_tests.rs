use mirin_core::device_registry::DeviceRegistry;
use mirin_core::scrcpy::EmbeddedScrcpyState;
use mirin_core::ui_extractor::UiExtractor;
use mirin_mcp::screenshot::ScreenshotRegistry;
use mirin_mcp::McpBridge;
use serde_json::json;

#[tokio::test]
async fn test_mcp_bridge_lifecycle_rpc() {
    // 1. Create mock AppHandle
    let app = tauri::test::mock_app();
    let app_handle = app.handle().clone();

    // 2. Initialize dependencies
    let state = EmbeddedScrcpyState::new();
    let ui_extractor = UiExtractor::new();
    let screenshot_registry = ScreenshotRegistry::new();
    let device_registry = DeviceRegistry::new();

    // 3. Create McpBridge
    let bridge = McpBridge::new(
        app_handle,
        state,
        ui_extractor,
        screenshot_registry,
        device_registry,
        None,
    );

    // 4. Test "ping" RPC method
    let ping_req = json!({
        "jsonrpc": "2.0",
        "id": 1,
        "method": "ping"
    });
    let ping_resp = bridge.handle_rpc_request(ping_req).await;
    assert_eq!(ping_resp["jsonrpc"], "2.0");
    assert_eq!(ping_resp["id"], 1);
    assert!(ping_resp["result"].is_object());

    // 5. Test "initialize" RPC method
    let init_req = json!({
        "jsonrpc": "2.0",
        "id": 2,
        "method": "initialize"
    });
    let init_resp = bridge.handle_rpc_request(init_req).await;
    assert_eq!(init_resp["id"], 2);
    assert_eq!(init_resp["result"]["protocolVersion"], "2024-11-05");

    // 6. Test "tools/list" RPC method
    let tools_req = json!({
        "jsonrpc": "2.0",
        "id": 3,
        "method": "tools/list"
    });
    let tools_resp = bridge.handle_rpc_request(tools_req).await;
    assert_eq!(tools_resp["id"], 3);
    assert!(tools_resp["result"]["tools"].is_array());
    let tools_list = tools_resp["result"]["tools"].as_array().unwrap();
    // Check that we advertise our core tools
    assert!(tools_list.iter().any(|t| t["name"] == "list_devices"));
    assert!(tools_list.iter().any(|t| t["name"] == "connect_device"));
}
