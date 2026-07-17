#![allow(dead_code)]

use axum::Router;
use rmcp::{
    handler::server::wrapper::Parameters,
    model::{
        Implementation, ListResourcesResult, ReadResourceRequestParams, ReadResourceResult,
        Resource, ResourceContents, ServerCapabilities, ServerInfo,
    },
    schemars,
    service::{RequestContext, RoleServer, ServiceExt},
    tool, tool_router,
    transport::streamable_http_server::{
        session::local::LocalSessionManager, StreamableHttpService,
    },
    ErrorData as McpError, ServerHandler,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::future::Future;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;

pub const MCP_HTTP_ADDRESS: &str = "127.0.0.1:7270";

pub trait ToolExecutor: Send + Sync {
    fn call_tool<'a>(
        &'a self,
        name: &'a str,
        args: Value,
    ) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send + 'a>>;
}

pub trait ResourceReader: Send + Sync {
    fn read_resource<'a>(
        &'a self,
        uri: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send + 'a>>;
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
pub struct EmptyParams {}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct SerialParams {
    #[schemars(description = "Android device serial. If omitted, use the active device.")]
    serial: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct ConnectDeviceParams {
    #[schemars(description = "Android device serial. If omitted, use the active device.")]
    serial: Option<String>,
    #[serde(default)]
    #[schemars(description = "Also open a popup mirror window for this device.")]
    popup: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct ScreenParams {
    serial: Option<String>,
    #[serde(default)]
    #[schemars(description = "Include the full UIAutomator XML instead of the sanitized tree.")]
    raw: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct ScreenshotParams {
    serial: Option<String>,
    #[serde(default)]
    #[schemars(description = "Draw numbered bounding boxes on the image.")]
    annotate: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct SelectorParams {
    serial: Option<String>,
    selector: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
enum CoordinateMode {
    Absolute,
    Normalized,
}

impl Default for CoordinateMode {
    fn default() -> Self {
        Self::Absolute
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct TapParams {
    serial: Option<String>,
    selector: Option<String>,
    x: Option<f32>,
    y: Option<f32>,
    #[serde(default)]
    coordinate_mode: CoordinateMode,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct LongPressParams {
    serial: Option<String>,
    selector: Option<String>,
    x: Option<f32>,
    y: Option<f32>,
    #[serde(default = "default_long_press_duration")]
    #[schemars(range(min = 50, max = 5000))]
    duration_ms: u64,
    #[serde(default)]
    coordinate_mode: CoordinateMode,
}

fn default_long_press_duration() -> u64 {
    800
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct GestureParams {
    serial: Option<String>,
    selector: Option<String>,
    start_x: Option<f32>,
    start_y: Option<f32>,
    end_x: f32,
    end_y: f32,
    #[serde(default = "default_swipe_duration")]
    duration_ms: u64,
    #[serde(default)]
    coordinate_mode: CoordinateMode,
}

fn default_swipe_duration() -> u64 {
    300
}

fn default_drag_duration() -> u64 {
    800
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
enum ScrollDirection {
    Up,
    Down,
}

impl Default for ScrollDirection {
    fn default() -> Self {
        Self::Down
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct ScrollToParams {
    serial: Option<String>,
    selector: String,
    #[serde(default)]
    direction: ScrollDirection,
    #[serde(default = "default_max_swipes")]
    #[schemars(range(min = 1, max = 50))]
    max_swipes: u64,
}

fn default_max_swipes() -> u64 {
    5
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct TypeTextParams {
    serial: Option<String>,
    text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct PressKeyParams {
    serial: Option<String>,
    keycode: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
enum ClipboardAction {
    Get,
    Set,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct ClipboardParams {
    serial: Option<String>,
    action: ClipboardAction,
    text: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
enum Orientation {
    Portrait,
    Landscape,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct OrientationParams {
    serial: Option<String>,
    orientation: Orientation,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct ListAppsParams {
    serial: Option<String>,
    #[serde(default = "default_true")]
    third_party_only: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct LaunchAppParams {
    serial: Option<String>,
    package: String,
    activity: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct PackageParams {
    serial: Option<String>,
    package: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct PermissionParams {
    serial: Option<String>,
    package: String,
    permission: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "lowercase")]
enum DialogAction {
    Accept,
    Dismiss,
}

impl Default for DialogAction {
    fn default() -> Self {
        Self::Accept
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct DialogParams {
    serial: Option<String>,
    #[serde(default)]
    action: DialogAction,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct LogcatParams {
    serial: Option<String>,
    #[serde(default = "default_log_lines")]
    #[schemars(range(min = 1, max = 5000))]
    lines: u64,
    package_filter: Option<String>,
    tag_filter: Option<String>,
}

fn default_log_lines() -> u64 {
    100
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
#[serde(rename_all = "snake_case")]
enum ScriptAction {
    Tap,
    LongPress,
    Swipe,
    Drag,
    TypeText,
    PressKey,
    Sleep,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct ScriptStepParams {
    action: ScriptAction,
    selector: Option<String>,
    x: Option<f32>,
    y: Option<f32>,
    end_x: Option<f32>,
    end_y: Option<f32>,
    text: Option<String>,
    keycode: Option<u32>,
    duration_ms: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, schemars::JsonSchema)]
struct RunScriptParams {
    serial: Option<String>,
    #[schemars(length(max = 50))]
    steps: Vec<ScriptStepParams>,
}

#[derive(Clone)]
pub struct McpServer {
    dispatcher: Arc<dyn ToolExecutor>,
    resource_dispatcher: Arc<dyn ResourceReader>,
}

impl McpServer {
    pub fn new(
        dispatcher: Arc<dyn ToolExecutor>,
        resource_dispatcher: Arc<dyn ResourceReader>,
    ) -> Self {
        Self {
            dispatcher,
            resource_dispatcher,
        }
    }

    async fn invoke<T: Serialize>(&self, name: &str, params: T) -> Result<String, String> {
        let arguments = serde_json::to_value(params).map_err(|error| error.to_string())?;
        let result = self.dispatcher.call_tool(name, arguments).await?;
        serde_json::to_string_pretty(&result).map_err(|error| error.to_string())
    }

    async fn read_resource_impl(
        &self,
        request: ReadResourceRequestParams,
    ) -> Result<ReadResourceResult, McpError> {
        let value = self
            .resource_dispatcher
            .read_resource(&request.uri)
            .await
            .map_err(|error| McpError::invalid_params(error, None))?;
        let contents = value
            .get("contents")
            .cloned()
            .ok_or_else(|| McpError::internal_error("resource returned no contents", None))?;
        let contents: Vec<ResourceContents> = serde_json::from_value(contents)
            .map_err(|error| McpError::internal_error(error.to_string(), None))?;
        Ok(ReadResourceResult::new(contents))
    }
}

#[tool_router]
impl McpServer {
    #[tool(
        name = "list_devices",
        description = "Get a list of all connected Android devices (USB and Wireless) with status and connection type."
    )]
    async fn list_devices(
        &self,
        Parameters(params): Parameters<EmptyParams>,
    ) -> Result<String, String> {
        self.invoke("list_devices", params).await
    }

    #[tool(
        name = "connect_device",
        description = "Ensure an embedded scrcpy mirroring session is running and ready for control commands. Reuses an existing session if already active. Serial is optional if already connected."
    )]
    async fn connect_device(
        &self,
        Parameters(params): Parameters<ConnectDeviceParams>,
    ) -> Result<String, String> {
        self.invoke("connect_device", params).await
    }

    #[tool(
        name = "disconnect_device",
        description = "Stop the embedded scrcpy mirroring session for a device and clean up ADB forward/reverse tunnels."
    )]
    async fn disconnect_device(
        &self,
        Parameters(params): Parameters<SerialParams>,
    ) -> Result<String, String> {
        self.invoke("disconnect_device", params).await
    }

    #[tool(
        name = "get_screen",
        description = "Get the current UI element tree of the device. Returns sanitized interactive elements with numeric IDs unless raw is true."
    )]
    async fn get_screen(
        &self,
        Parameters(params): Parameters<ScreenParams>,
    ) -> Result<String, String> {
        self.invoke("get_screen", params).await
    }

    #[tool(
        name = "get_screenshot",
        description = "Get a live screenshot of the device. If annotate is true, draw Set-of-Mark numbered badges corresponding to element IDs."
    )]
    async fn get_screenshot(
        &self,
        Parameters(params): Parameters<ScreenshotParams>,
    ) -> Result<String, String> {
        self.invoke("get_screenshot", params).await
    }

    #[tool(
        name = "find_element",
        description = "Find a UI element by numeric ID, exact or substring text, content description, or resource ID."
    )]
    async fn find_element(
        &self,
        Parameters(params): Parameters<SelectorParams>,
    ) -> Result<String, String> {
        self.invoke("find_element", params).await
    }

    #[tool(
        name = "tap",
        description = "Tap on a UI element by selector or on absolute/normalized coordinates. Requires an active scrcpy mirror session."
    )]
    async fn tap(&self, Parameters(params): Parameters<TapParams>) -> Result<String, String> {
        self.invoke("tap", params).await
    }

    #[tool(
        name = "long_press",
        description = "Long press on a UI element or coordinates for a duration from 50ms to 5000ms. Requires an active scrcpy mirror session."
    )]
    async fn long_press(
        &self,
        Parameters(params): Parameters<LongPressParams>,
    ) -> Result<String, String> {
        self.invoke("long_press", params).await
    }

    #[tool(
        name = "swipe",
        description = "Swipe from start coordinates to end coordinates, or from a selector's center. Requires an active scrcpy mirror session."
    )]
    async fn swipe(&self, Parameters(params): Parameters<GestureParams>) -> Result<String, String> {
        self.invoke("swipe", params).await
    }

    #[tool(
        name = "drag",
        description = "Drag from start coordinates to end coordinates, or from a selector's center. Requires an active scrcpy mirror session."
    )]
    async fn drag(
        &self,
        Parameters(mut params): Parameters<GestureParams>,
    ) -> Result<String, String> {
        if params.duration_ms == default_swipe_duration() {
            params.duration_ms = default_drag_duration();
        }
        self.invoke("drag", params).await
    }

    #[tool(
        name = "scroll_to",
        description = "Scroll up or down until a selector becomes visible, re-checking the selector after each swipe."
    )]
    async fn scroll_to(
        &self,
        Parameters(params): Parameters<ScrollToParams>,
    ) -> Result<String, String> {
        self.invoke("scroll_to", params).await
    }

    #[tool(
        name = "type_text",
        description = "Type UTF-8 text directly into the focused input field."
    )]
    async fn type_text(
        &self,
        Parameters(params): Parameters<TypeTextParams>,
    ) -> Result<String, String> {
        self.invoke("type_text", params).await
    }

    #[tool(
        name = "press_key",
        description = "Press an Android keycode, such as 3 for HOME, 4 for BACK, or 66 for ENTER."
    )]
    async fn press_key(
        &self,
        Parameters(params): Parameters<PressKeyParams>,
    ) -> Result<String, String> {
        self.invoke("press_key", params).await
    }

    #[tool(
        name = "hide_keyboard",
        description = "Hide the on-screen keyboard by sending the Android BACK key."
    )]
    async fn hide_keyboard(
        &self,
        Parameters(params): Parameters<SerialParams>,
    ) -> Result<String, String> {
        self.invoke("hide_keyboard", params).await
    }

    #[tool(
        name = "clipboard",
        description = "Get or set device clipboard text. Set requires a scrcpy session or falls back to ADB."
    )]
    async fn clipboard(
        &self,
        Parameters(params): Parameters<ClipboardParams>,
    ) -> Result<String, String> {
        self.invoke("clipboard", params).await
    }

    #[tool(
        name = "set_orientation",
        description = "Set device rotation orientation to portrait or landscape."
    )]
    async fn set_orientation(
        &self,
        Parameters(params): Parameters<OrientationParams>,
    ) -> Result<String, String> {
        self.invoke("set_orientation", params).await
    }

    #[tool(
        name = "list_apps",
        description = "List installed package names on the device."
    )]
    async fn list_apps(
        &self,
        Parameters(params): Parameters<ListAppsParams>,
    ) -> Result<String, String> {
        self.invoke("list_apps", params).await
    }

    #[tool(
        name = "launch_app",
        description = "Launch an app by package name, resolving its launcher activity when needed."
    )]
    async fn launch_app(
        &self,
        Parameters(params): Parameters<LaunchAppParams>,
    ) -> Result<String, String> {
        self.invoke("launch_app", params).await
    }

    #[tool(name = "stop_app", description = "Force stop an app package.")]
    async fn stop_app(
        &self,
        Parameters(params): Parameters<PackageParams>,
    ) -> Result<String, String> {
        self.invoke("stop_app", params).await
    }

    #[tool(
        name = "get_current_activity",
        description = "Get the top resumed activity and package currently on screen."
    )]
    async fn get_current_activity(
        &self,
        Parameters(params): Parameters<SerialParams>,
    ) -> Result<String, String> {
        self.invoke("get_current_activity", params).await
    }

    #[tool(
        name = "grant_permission",
        description = "Grant a runtime permission to an app package."
    )]
    async fn grant_permission(
        &self,
        Parameters(params): Parameters<PermissionParams>,
    ) -> Result<String, String> {
        self.invoke("grant_permission", params).await
    }

    #[tool(
        name = "revoke_permission",
        description = "Revoke a runtime permission from an app package."
    )]
    async fn revoke_permission(
        &self,
        Parameters(params): Parameters<PermissionParams>,
    ) -> Result<String, String> {
        self.invoke("revoke_permission", params).await
    }

    #[tool(
        name = "handle_dialog",
        description = "Click accept/allow or dismiss/deny buttons on dialogs by matching button text."
    )]
    async fn handle_dialog(
        &self,
        Parameters(params): Parameters<DialogParams>,
    ) -> Result<String, String> {
        self.invoke("handle_dialog", params).await
    }

    #[tool(
        name = "get_logcat",
        description = "Get recent logcat lines with optional package or tag filtering."
    )]
    async fn get_logcat(
        &self,
        Parameters(params): Parameters<LogcatParams>,
    ) -> Result<String, String> {
        self.invoke("get_logcat", params).await
    }

    #[tool(
        name = "run_script",
        description = "Execute up to 50 sequential device actions, re-resolving selectors dynamically at each step."
    )]
    async fn run_script(
        &self,
        Parameters(params): Parameters<RunScriptParams>,
    ) -> Result<String, String> {
        self.invoke("run_script", params).await
    }
}

impl ServerHandler for McpServer {
    fn get_info(&self) -> ServerInfo {
        ServerInfo::new(
            ServerCapabilities::builder()
                .enable_tools()
                .enable_resources()
                .build(),
        )
        .with_instructions(
            "Mirin controls connected Android devices through embedded scrcpy and ADB.",
        )
        .with_server_info(Implementation::new("mirin-mcp", env!("CARGO_PKG_VERSION")))
    }

    fn list_resources(
        &self,
        _request: Option<rmcp::model::PaginatedRequestParams>,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ListResourcesResult, McpError>> + Send + '_ {
        let resource = Resource::new("mirin://devices/{id}/logcat", "Device Logcat Stream")
            .with_description("Recent logcat entries for the specified Android device serial ID.")
            .with_mime_type("text/plain");
        std::future::ready(Ok(ListResourcesResult::with_all_items(vec![resource])))
    }

    fn read_resource(
        &self,
        request: ReadResourceRequestParams,
        _context: RequestContext<RoleServer>,
    ) -> impl std::future::Future<Output = Result<ReadResourceResult, McpError>> + Send + '_ {
        self.read_resource_impl(request)
    }
}

pub fn http_router(server: McpServer) -> Router {
    let service = StreamableHttpService::new(
        move || Ok(server.clone()),
        LocalSessionManager::default().into(),
        Default::default(),
    );
    Router::new().nest_service("/mcp", service)
}

pub async fn serve(server: McpServer) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let address = MCP_HTTP_ADDRESS.parse::<SocketAddr>()?;
    serve_on(server, address).await
}

pub async fn serve_on(
    server: McpServer,
    address: SocketAddr,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let listener = tokio::net::TcpListener::bind(address).await?;

    eprintln!("[MCP] Streamable HTTP server listening on http://{address}/mcp");
    axum::serve(listener, http_router(server)).await?;
    Ok(())
}

pub async fn serve_stdio(
    server: McpServer,
) -> Result<(), Box<dyn std::error::Error + Send + Sync>> {
    let service = server.serve(rmcp::transport::stdio()).await?;
    service.waiting().await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::McpServer;

    #[test]
    fn native_router_exposes_every_legacy_tool() {
        let tools = McpServer::tool_router().list_all();
        assert_eq!(tools.len(), 25);
        assert!(tools.iter().any(|tool| tool.name == "list_devices"));
        assert!(tools.iter().any(|tool| tool.name == "run_script"));
    }
}
