use clap::{Parser, Subcommand, ValueEnum};
use mirin_core::adb::Adb;
use mirin_core::device_registry::DeviceRegistry;
use mirin_core::scrcpy::EmbeddedScrcpyState;
use mirin_core::ui_extractor::UiExtractor;
use mirin_mcp::executor::{RuntimeHost, ToolDispatcher};
use mirin_mcp::server::{McpServer, ResourceReader, ToolExecutor};
use serde_json::{json, Value};
use std::future::Future;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::pin::Pin;
use std::sync::Arc;

#[derive(Debug, Parser)]
#[command(name = "mirin-cli", about = "Control Android devices with Mirin")]
struct Cli {
    #[command(subcommand)]
    command: Command,
}

#[derive(Debug, Subcommand)]
enum Command {
    /// Print connected Android devices as JSON.
    Devices,
    /// Run the reusable Mirin MCP server.
    Mcp {
        #[arg(long, value_enum, default_value_t = Transport::Stdio)]
        transport: Transport,
        #[arg(long, default_value = "127.0.0.1:7270")]
        listen: String,
    },
}

#[derive(Clone, Copy, Debug, ValueEnum)]
enum Transport {
    Stdio,
    Http,
}

#[derive(Clone)]
struct CliRuntimeHost {
    resources_dir: PathBuf,
}

impl CliRuntimeHost {
    fn new() -> Result<Self, String> {
        let resources_dir = std::env::var_os("MIRIN_RESOURCES_DIR")
            .map(PathBuf::from)
            .or_else(|| {
                let development_path =
                    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../resources");
                development_path.exists().then_some(development_path)
            })
            .or_else(|| {
                std::env::current_dir()
                    .ok()
                    .map(|path| path.join("resources"))
                    .filter(|path| path.exists())
            })
            .ok_or_else(|| {
                "Could not find Mirin resources. Set MIRIN_RESOURCES_DIR to the resources directory."
                    .to_string()
            })?;

        Ok(Self { resources_dir })
    }

    fn platform_dir(&self, component: &str) -> Result<PathBuf, String> {
        let platform = match (std::env::consts::OS, std::env::consts::ARCH) {
            ("windows", _) => "windows",
            ("macos", "aarch64") => "macos-aarch64",
            ("macos", "x86_64") => "macos-x86_64",
            (os, arch) => return Err(format!("Unsupported OS/architecture: {os}-{arch}")),
        };
        Ok(self.resources_dir.join(component).join(platform))
    }

    fn required_file(&self, path: PathBuf, description: &str) -> Result<PathBuf, String> {
        if path.exists() {
            Ok(path)
        } else {
            Err(format!("{description} not found at {}", path.display()))
        }
    }
}

impl RuntimeHost for CliRuntimeHost {
    fn adb_path(&self) -> Result<PathBuf, String> {
        let name = if cfg!(target_os = "windows") {
            "adb.exe"
        } else {
            "adb"
        };
        self.required_file(self.platform_dir("adb")?.join(name), "ADB executable")
    }

    fn scrcpy_path(&self) -> Result<PathBuf, String> {
        let name = if cfg!(target_os = "windows") {
            "scrcpy.exe"
        } else {
            "scrcpy"
        };
        self.required_file(self.platform_dir("scrcpy")?.join(name), "scrcpy executable")
    }

    fn scrcpy_server_path(&self) -> Result<PathBuf, String> {
        self.required_file(
            self.platform_dir("scrcpy")?.join("scrcpy-server"),
            "scrcpy server",
        )
    }

    fn scrcpy_dir(&self) -> Result<PathBuf, String> {
        self.required_file(self.platform_dir("scrcpy")?, "scrcpy directory")
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
            let elements = if annotate {
                ui_extractor
                    .get_tree(&Adb::new(self.adb_path()?), serial, false, false)
                    .await
                    .map(|tree| tree.elements)
                    .unwrap_or_default()
            } else {
                Vec::new()
            };
            mirin_core::screenshot::capture_fallback(self.adb_path()?, serial, elements, annotate)
                .await
        })
    }

    fn open_mirror_window<'a>(
        &'a self,
        _serial: String,
        _model: String,
    ) -> Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>> {
        Box::pin(async {
            Err("Popup mirror windows are only available in the Tauri application".to_string())
        })
    }
}

struct CliResourceReader {
    host: Arc<CliRuntimeHost>,
}

impl ResourceReader for CliResourceReader {
    fn read_resource<'a>(
        &'a self,
        uri: &'a str,
    ) -> Pin<Box<dyn Future<Output = Result<Value, String>> + Send + 'a>> {
        Box::pin(async move {
            let serial = uri
                .strip_prefix("mirin://devices/")
                .and_then(|path| path.strip_suffix("/logcat"))
                .ok_or_else(|| format!("Unknown or malformed resource URI: {uri}"))?;
            let logs = Adb::new(self.host.adb_path()?)
                .with_device(serial)
                .execute(&["shell", "logcat", "-d", "-t", "200"])
                .await?;
            Ok(json!({
                "contents": [{
                    "uri": uri,
                    "mimeType": "text/plain",
                    "text": logs
                }]
            }))
        })
    }
}

fn build_server(host: Arc<CliRuntimeHost>) -> McpServer {
    let dispatcher = ToolDispatcher::new(
        host.clone(),
        EmbeddedScrcpyState::new(),
        UiExtractor::new(),
        DeviceRegistry::new(),
    );
    let dispatcher: Arc<dyn ToolExecutor> = Arc::new(dispatcher);
    let resources: Arc<dyn ResourceReader> = Arc::new(CliResourceReader { host });
    McpServer::new(dispatcher, resources)
}

async fn run(cli: Cli) -> Result<(), String> {
    let host = Arc::new(CliRuntimeHost::new()?);

    match cli.command {
        Command::Devices => {
            let devices = DeviceRegistry::new()
                .get_resolved_devices(host.adb_path()?)
                .await?;
            println!(
                "{}",
                serde_json::to_string_pretty(&devices).map_err(|error| error.to_string())?
            );
            Ok(())
        }
        Command::Mcp { transport, listen } => {
            let server = build_server(host);
            match transport {
                Transport::Stdio => mirin_mcp::server::serve_stdio(server)
                    .await
                    .map_err(|error| error.to_string()),
                Transport::Http => {
                    let address: SocketAddr = listen
                        .parse()
                        .map_err(|error| format!("Invalid --listen address '{listen}': {error}"))?;
                    mirin_mcp::server::serve_on(server, address)
                        .await
                        .map_err(|error| error.to_string())
                }
            }
        }
    }
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();
    if let Err(error) = run(cli).await {
        eprintln!("mirin-cli: {error}");
        std::process::exit(1);
    }
}
