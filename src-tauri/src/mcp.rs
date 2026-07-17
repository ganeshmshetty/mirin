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
use mirin_mcp::tools::{RuntimeHost, ToolDispatcher};
use std::future::Future;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;
use tauri::AppHandle;

pub use mirin_mcp::server::serve;

type OpenMirrorWindowCallback = Arc<
    dyn Fn(AppHandle, String, String) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>>
        + Send
        + Sync,
>;

struct TauriRuntimeHost {
    app: AppHandle,
    screenshot_registry: ScreenshotRegistry,
    open_mirror_window_fn: Option<OpenMirrorWindowCallback>,
}

impl RuntimeHost for TauriRuntimeHost {
    fn adb_path(&self) -> Result<PathBuf, String> {
        mirin_mcp::utils::get_adb_path(&self.app)
    }

    fn scrcpy_path(&self) -> Result<PathBuf, String> {
        mirin_mcp::utils::get_scrcpy_path(&self.app)
    }

    fn scrcpy_server_path(&self) -> Result<PathBuf, String> {
        mirin_mcp::utils::get_scrcpy_server_path(&self.app)
    }

    fn scrcpy_dir(&self) -> Result<PathBuf, String> {
        mirin_mcp::utils::get_scrcpy_dir(&self.app)
    }

    fn capture_screenshot<'a>(
        &'a self,
        ui_extractor: &'a UiExtractor,
        serial: &'a str,
        annotate: bool,
    ) -> Pin<
        Box<
            dyn Future<Output = Result<mirin_core::screenshot::ScreenshotResult, String>>
                + Send
                + 'a,
        >,
    > {
        Box::pin(async move {
            self.screenshot_registry
                .capture(&self.app, ui_extractor, serial, annotate)
                .await
        })
    }

    fn open_mirror_window<'a>(
        &'a self,
        serial: String,
        model: String,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        Box::pin(async move {
            match &self.open_mirror_window_fn {
                Some(callback) => callback(self.app.clone(), serial, model).await,
                None => Err("Mirror window support is unavailable".to_string()),
            }
        })
    }
}

#[allow(clippy::too_many_arguments)]
pub fn build_server(
    app: AppHandle,
    state: EmbeddedScrcpyState,
    ui_extractor: UiExtractor,
    screenshot_registry: ScreenshotRegistry,
    device_registry: DeviceRegistry,
    open_mirror_window_fn: Option<OpenMirrorWindowCallback>,
) -> McpServer {
    let host = Arc::new(TauriRuntimeHost {
        app: app.clone(),
        screenshot_registry,
        open_mirror_window_fn,
    });
    let dispatcher = Arc::new(ToolDispatcher::new(
        host,
        state,
        ui_extractor,
        device_registry,
    ));
    let resource_dispatcher = Arc::new(ResourceDispatcher::new(app));

    // The concrete dispatchers are Tauri adapters. The server only sees the
    // transport-neutral interfaces, so another host can provide its own.
    let dispatcher: Arc<dyn ToolExecutor> = dispatcher;
    let resource_dispatcher: Arc<dyn mirin_mcp::server::ResourceReader> = resource_dispatcher;

    McpServer::new(dispatcher, resource_dispatcher)
}
