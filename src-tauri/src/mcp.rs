//! Tauri adapter for the reusable MCP server.
//!
//! The MCP protocol, typed tool schemas, router, and HTTP transport live in
//! mirin_mcp::server. This module only assembles Tauri-owned capabilities.

use mirin_core::device_registry::DeviceRegistry;
use mirin_core::scrcpy::EmbeddedScrcpyState;
use mirin_core::ui_extractor::UiExtractor;
use mirin_mcp::resources::ResourceDispatcher;
use mirin_mcp::screenshot::ScreenshotRegistry;
use mirin_mcp::server::{McpServer, ToolExecutor};
use mirin_mcp::tools::{OpenMirrorWindowCallback, ToolDispatcher};
use std::sync::Arc;
use tauri::AppHandle;

pub use mirin_mcp::server::serve;

#[allow(clippy::too_many_arguments)]
pub fn build_server(
    app: AppHandle,
    state: EmbeddedScrcpyState,
    ui_extractor: UiExtractor,
    screenshot_registry: ScreenshotRegistry,
    device_registry: DeviceRegistry,
    open_mirror_window_fn: Option<OpenMirrorWindowCallback>,
) -> McpServer {
    let dispatcher = Arc::new(ToolDispatcher::new(
        app.clone(),
        state,
        ui_extractor,
        screenshot_registry,
        device_registry,
        open_mirror_window_fn,
    ));
    let resource_dispatcher = Arc::new(ResourceDispatcher::new(app));

    // The concrete dispatchers are Tauri adapters. The server only sees the
    // transport-neutral interfaces, so another host can provide its own.
    let dispatcher: Arc<dyn ToolExecutor> = dispatcher;
    let resource_dispatcher: Arc<dyn mirin_mcp::server::ResourceReader> = resource_dispatcher;

    McpServer::new(dispatcher, resource_dispatcher)
}
