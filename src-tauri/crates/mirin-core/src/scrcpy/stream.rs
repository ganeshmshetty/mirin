use crate::adb::Adb;
use anyhow::{anyhow, Result};
use serde::Deserialize;
use socket2::{Domain, Socket, Type};
use std::net::SocketAddr;
use tokio::io::{AsyncBufReadExt, AsyncReadExt, BufReader};
use tokio::net::{TcpListener, TcpStream};

const SCRCPY_SERVER_REMOTE_PATH: &str = "/data/local/tmp/scrcpy-server.jar";

#[derive(Debug, Clone, Deserialize)]
pub struct EmbeddedStreamSettings {
    pub max_size: u32,
    pub max_fps: u32,
    pub video_bit_rate: u32,
    pub video_codec: String,
    pub audio: bool,
}

impl Default for EmbeddedStreamSettings {
    fn default() -> Self {
        Self {
            max_size: 1080,
            max_fps: 60,
            video_bit_rate: 8000000,
            video_codec: "h264".to_string(),
            audio: false,
        }
    }
}

pub struct ConnectedStreams {
    pub video_socket: TcpStream,
    #[allow(dead_code)]
    pub audio_socket: Option<TcpStream>,
    pub control_socket: TcpStream,
    pub screen_width: u32,
    pub screen_height: u32,
    pub server_process: tokio::process::Child,
    pub port: u16,
}

pub async fn start_server(
    adb: &Adb,
    serial: &str,
    server_path: &std::path::Path,
    client_version: &str,
    settings: &EmbeddedStreamSettings,
) -> Result<ConnectedStreams> {
    adb.kill_scrcpy_server(serial).await;

    let server_path_str = server_path
        .to_str()
        .ok_or_else(|| anyhow!("Invalid server path"))?;
    adb.push(serial, server_path_str, SCRCPY_SERVER_REMOTE_PATH)
        .await
        .map_err(|e| anyhow!("Failed to push scrcpy-server: {}", e))?;

    let addr: SocketAddr = "127.0.0.1:0".parse()?;
    let socket = Socket::new(Domain::IPV4, Type::STREAM, None)?;
    socket.set_reuse_address(true)?;
    socket.set_nonblocking(true)?;
    socket.bind(&addr.into())?;
    socket.listen(4)?;
    let listener = TcpListener::from_std(socket.into())?;
    let port = listener.local_addr()?.port();

    let _ = adb.remove_forward(serial, port).await;
    adb.reverse(serial, "localabstract:scrcpy", port)
        .await
        .map_err(|e| anyhow!("Failed to set adb reverse: {}", e))?;

    let audio_args = if settings.audio {
        "audio=true audio_codec=raw"
    } else {
        "audio=false"
    };

    if !matches!(settings.video_codec.as_str(), "h264" | "h265") {
        return Err(anyhow!("Unsupported video codec: {}", settings.video_codec));
    }

    let server_cmd = format!(
        "CLASSPATH={path} app_process / com.genymobile.scrcpy.Server {version} \
         tunnel_forward=false \
         {audio_args} \
         control=true \
         video_codec={codec} \
         max_size={max_size} \
         max_fps={max_fps} \
         video_bit_rate={bitrate} \
         send_device_meta=true \
         send_dummy_byte=false \
         log_level=info",
        path = SCRCPY_SERVER_REMOTE_PATH,
        version = client_version,
        audio_args = audio_args,
        codec = settings.video_codec,
        max_size = settings.max_size,
        max_fps = settings.max_fps,
        bitrate = settings.video_bit_rate,
    );

    let mut server_process = adb
        .spawn_shell(serial, &server_cmd)
        .map_err(|e| anyhow!("Failed to spawn scrcpy server shell: {}", e))?;

    if let Some(stdout) = server_process.stdout.take() {
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[scrcpy-server stdout] {}", line);
            }
        });
    }

    if let Some(stderr) = server_process.stderr.take() {
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                eprintln!("[scrcpy-server stderr] {}", line);
            }
        });
    }

    let (mut video_socket, _) =
        tokio::time::timeout(tokio::time::Duration::from_secs(12), listener.accept())
            .await
            .map_err(|_| anyhow!("Timeout waiting for video socket connection from scrcpy server"))?
            .map_err(|e| anyhow!("Accept failed for video socket: {}", e))?;

    let audio_socket = if settings.audio {
        let (mut audio_sock, _) =
            tokio::time::timeout(tokio::time::Duration::from_secs(5), listener.accept())
                .await
                .map_err(|_| anyhow!("Timeout waiting for audio socket connection"))?
                .map_err(|e| anyhow!("Accept failed for audio socket: {}", e))?;

        let mut audio_codec_buf = [0u8; 4];
        audio_sock.read_exact(&mut audio_codec_buf).await?;

        Some(audio_sock)
    } else {
        None
    };

    let (control_socket, _) =
        tokio::time::timeout(tokio::time::Duration::from_secs(5), listener.accept())
            .await
            .map_err(|_| anyhow!("Timeout waiting for control socket connection"))?
            .map_err(|e| anyhow!("Accept failed for control socket: {}", e))?;

    let mut device_name_buf = [0u8; 64];
    video_socket.read_exact(&mut device_name_buf).await?;

    let mut codec_buf = [0u8; 4];
    video_socket.read_exact(&mut codec_buf).await?;

    let mut size_buf = [0u8; 8];
    video_socket.read_exact(&mut size_buf).await?;
    let screen_width = u32::from_be_bytes([size_buf[0], size_buf[1], size_buf[2], size_buf[3]]);
    let screen_height = u32::from_be_bytes([size_buf[4], size_buf[5], size_buf[6], size_buf[7]]);

    drop(listener);

    Ok(ConnectedStreams {
        video_socket,
        audio_socket,
        control_socket,
        screen_width,
        screen_height,
        server_process,
        port,
    })
}

pub async fn stop_server(adb: &Adb, serial: &str, port: u16) {
    let _ = adb.remove_reverse(serial, "localabstract:scrcpy").await;
    let _ = adb.remove_forward(serial, port).await;
    adb.kill_scrcpy_server(serial).await;
}
