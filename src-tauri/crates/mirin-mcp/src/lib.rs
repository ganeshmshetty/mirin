pub mod resources;
pub mod screenshot;
pub mod tools;
pub mod utils;

use serde_json::{json, Value};
use std::io::Write;
use std::sync::Arc;
use tauri::AppHandle;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader as TokioBufReader};
use tokio::net::{TcpListener, TcpStream};
use crate::resources::ResourceDispatcher;
use crate::screenshot::ScreenshotRegistry;
use crate::tools::ToolDispatcher;
use mirin_core::ui_extractor::UiExtractor;
use mirin_core::scrcpy::EmbeddedScrcpyState;

pub const MCP_LOOPBACK_PORT: u16 = 48484;

#[derive(Clone)]
pub struct McpBridge {
    tool_dispatcher: ToolDispatcher,
    resource_dispatcher: ResourceDispatcher,
}

impl McpBridge {
    pub fn new(
        app: AppHandle,
        state: EmbeddedScrcpyState,
        ui_extractor: UiExtractor,
        screenshot_registry: ScreenshotRegistry,
        device_registry: mirin_core::device_registry::DeviceRegistry,
        open_mirror_window_fn: Option<crate::tools::OpenMirrorWindowCallback>,
    ) -> Self {
        Self {
            tool_dispatcher: ToolDispatcher::new(app.clone(), state, ui_extractor, screenshot_registry, device_registry, open_mirror_window_fn),
            resource_dispatcher: ResourceDispatcher::new(app),
        }
    }

    pub async fn handle_rpc_request(&self, req: Value) -> Value {
        let id = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req.get("method").and_then(|m| m.as_str()).unwrap_or("");
        let params = req.get("params").cloned().unwrap_or(json!({}));

        let result = match method {
            "initialize" => Ok(json!({
                "protocolVersion": "2024-11-05",
                "capabilities": {
                    "tools": { "listChanged": false },
                    "resources": { "subscribe": false, "listChanged": false }
                },
                "serverInfo": {
                    "name": "mirin-mcp",
                    "version": "0.1.1"
                }
            })),
            "notifications/initialized" => {
                // Per JSON-RPC/MCP spec, notifications MUST NOT receive a response.
                return Value::Null;
            }
            "tools/list" => Ok(json!({ "tools": ToolDispatcher::get_tools_list() })),
            "tools/call" => {
                let name = params.get("name").and_then(|n| n.as_str()).unwrap_or("");
                let args = params.get("arguments").cloned().unwrap_or(json!({}));
                match self.tool_dispatcher.call_tool(name, args).await {
                    Ok(res) => Ok(json!({
                        "content": [{
                            "type": "text",
                            "text": serde_json::to_string_pretty(&res).unwrap_or_default()
                        }]
                    })),
                    Err(e) => Ok(json!({
                        "content": [{
                            "type": "text",
                            "text": format!("Error: {}", e)
                        }],
                        "isError": true
                    })),
                }
            }
            "resources/list" => Ok(json!({ "resources": ResourceDispatcher::get_resources_list() })),
            "resources/read" => {
                let uri = params.get("uri").and_then(|u| u.as_str()).unwrap_or("");
                match self.resource_dispatcher.read_resource(uri).await {
                    Ok(res) => return json!({
                        "jsonrpc": "2.0", "id": id, "result": res
                    }),
                    Err(e) => return json!({
                        "jsonrpc": "2.0", "id": id,
                        "error": { "code": -32002, "message": e }
                    }),
                }
            }
            "ping" => Ok(json!({})),
            _ => Err(format!("Method not found: {}", method)),
        };

        match result {
            Ok(res) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": res
            }),
            Err(e) => json!({
                "jsonrpc": "2.0",
                "id": id,
                "error": {
                    "code": -32601,
                    "message": e
                }
            }),
        }
    }
}

fn get_auth_token_path() -> std::path::PathBuf {
    std::env::temp_dir().join("mirin_mcp_auth.token")
}

fn save_auth_token(token: &str) -> std::io::Result<()> {
    let path = get_auth_token_path();
    std::fs::write(&path, token)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        if let Ok(metadata) = std::fs::metadata(&path) {
            let mut perms = metadata.permissions();
            perms.set_mode(0o600);
            let _ = std::fs::set_permissions(&path, perms);
        }
    }
    Ok(())
}

pub async fn start_loopback_server(bridge: Arc<McpBridge>) {
    let token = uuid::Uuid::new_v4().to_string();
    if let Err(e) = save_auth_token(&token) {
        eprintln!("[MCP] Warning: Failed to save auth token file: {}", e);
    }

    let listener = match TcpListener::bind(format!("127.0.0.1:{}", MCP_LOOPBACK_PORT)).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("[MCP] Failed to bind loopback server on port {}: {}", MCP_LOOPBACK_PORT, e);
            return;
        }
    };

    loop {
        match listener.accept().await {
            Ok((mut socket, _)) => {
                let bridge_clone = bridge.clone();
                let expected_token = token.clone();
                tokio::spawn(async move {
                    let (reader, mut writer) = socket.split();
                    let mut buf_reader = TokioBufReader::new(reader);
                    
                    // First line must be AUTH: <secret>
                    let mut auth_line = String::new();
                    if buf_reader.read_line(&mut auth_line).await.is_err() {
                        return;
                    }
                    if auth_line.trim() != format!("AUTH: {}", expected_token) {
                        let _ = writer.write_all(b"UNAUTHORIZED\n").await;
                        return;
                    }
                    let _ = writer.write_all(b"OK\n").await;
                    let _ = writer.flush().await;

                    let mut line = String::new();
                    while let Ok(bytes_read) = buf_reader.read_line(&mut line).await {
                        if bytes_read == 0 {
                            break;
                        }
                        let trimmed = line.trim();
                        if trimmed.is_empty() {
                            line.clear();
                            continue;
                        }

                        if let Some(len_str) = trimmed.strip_prefix("Content-Length:") {
                            let Ok(len) = len_str.trim().parse::<usize>() else {
                                break; // malformed header, close connection
                            };
                            // Consume any remaining header lines until the blank separator
                            loop {
                                let mut header_line = String::new();
                                if buf_reader.read_line(&mut header_line).await.unwrap_or(0) == 0 {
                                    break;
                                }
                                if header_line.trim().is_empty() {
                                    break;
                                }
                            }
                            let mut payload = vec![0u8; len];
                            if buf_reader.read_exact(&mut payload).await.is_ok() {
                                if let Ok(req) = serde_json::from_slice::<Value>(&payload) {
                                    let res = bridge_clone.handle_rpc_request(req).await;
                                    if !res.is_null() {
                                        let res_bytes = serde_json::to_vec(&res).unwrap_or_default();
                                        let header = format!("Content-Length: {}\r\n\r\n", res_bytes.len());
                                        let _ = writer.write_all(header.as_bytes()).await;
                                        let _ = writer.write_all(&res_bytes).await;
                                        let _ = writer.flush().await;
                                    }
                                }
                            }
                        } else if trimmed.starts_with('{') {
                            if let Ok(req) = serde_json::from_str::<Value>(trimmed) {
                                let res = bridge_clone.handle_rpc_request(req).await;
                                if !res.is_null() {
                                    let res_str = serde_json::to_string(&res).unwrap_or_default() + "\n";
                                    let _ = writer.write_all(res_str.as_bytes()).await;
                                    let _ = writer.flush().await;
                                }
                            }
                        }
                        line.clear();
                    }
                });
            }
            Err(e) => {
                eprintln!("[MCP] Accept failed: {}. Backing off for 1s...", e);
                tokio::time::sleep(std::time::Duration::from_secs(1)).await;
            }
        }
    }
}

/// Entrypoint when `mirin --mcp` is invoked over stdio by AI desktop clients.
pub fn run_stdio_proxy() {
    let rt = tokio::runtime::Runtime::new().expect("Failed to create tokio runtime for MCP proxy");
    rt.block_on(async {
        // Attempt to connect to running Mirin instance on loopback port
        if let Ok(mut socket) = TcpStream::connect(format!("127.0.0.1:{}", MCP_LOOPBACK_PORT)).await {
            let secret = match std::fs::read_to_string(get_auth_token_path()) {
                Ok(s) => s.trim().to_string(),
                Err(_) => {
                    let err = json!({
                        "jsonrpc": "2.0",
                        "id": Value::Null,
                        "error": {
                            "code": -32000,
                            "message": "Failed to read MCP auth token file. Is Mirin running?"
                        }
                    });
                    let out = serde_json::to_string(&err).unwrap() + "\n";
                    let _ = std::io::stdout().write_all(out.as_bytes());
                    return;
                }
            };

            let (reader, mut writer) = socket.split();
            let mut buf_reader = TokioBufReader::new(reader);
            let auth_cmd = format!("AUTH: {}\n", secret);
            if writer.write_all(auth_cmd.as_bytes()).await.is_err() || writer.flush().await.is_err() {
                return;
            }
            let mut resp = String::new();
            if buf_reader.read_line(&mut resp).await.is_err() || resp.trim() != "OK" {
                eprintln!("[MCP Proxy] Loopback authentication rejected.");
                return;
            }

            let mut stdin = tokio::io::stdin();
            let mut stdout = tokio::io::stdout();

            let stdin_to_tcp = async {
                let _ = tokio::io::copy(&mut stdin, &mut writer).await;
                let _ = writer.shutdown().await;
            };
            let _ = tokio::join!(
                stdin_to_tcp,
                tokio::io::copy(&mut buf_reader, &mut stdout)
            );
        } else {
            // Fallback warning if GUI is not running (stdio clients should launch GUI or run bridge)
            let err = json!({
                "jsonrpc": "2.0",
                "id": Value::Null,
                "error": {
                    "code": -32000,
                    "message": "Mirin GUI is not running. Please start Mirin to enable embedded scrcpy mirroring."
                }
            });
            let out = serde_json::to_string(&err).unwrap() + "\n";
            let _ = std::io::stdout().write_all(out.as_bytes());
        }
    });
    std::process::exit(0);
}
