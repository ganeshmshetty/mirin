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
    if !server_path.exists() {
        return Err(anyhow!(
            "scrcpy-server.jar not found at {}",
            server_path.display()
        ));
    }

    if !matches!(settings.video_codec.as_str(), "h264" | "h265") {
        return Err(anyhow!("Unsupported video codec: {}", settings.video_codec));
    }

    // Clean up any stale reverse tunnels or leftover scrcpy processes on the device first
    let _ = adb.remove_reverse(serial, "localabstract:scrcpy").await;
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
    let _ = adb.remove_reverse(serial, "localabstract:scrcpy").await;
    if let Err(e) = adb.reverse(serial, "localabstract:scrcpy", port).await {
        return Err(anyhow!("Failed to set adb reverse: {}", e));
    }

    let audio_args = if settings.audio {
        "audio=true audio_codec=raw"
    } else {
        "audio=false"
    };

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

    let mut server_process = match adb.spawn_shell(serial, &server_cmd) {
        Ok(child) => child,
        Err(e) => {
            let _ = adb.remove_reverse(serial, "localabstract:scrcpy").await;
            let _ = adb.remove_forward(serial, port).await;
            return Err(anyhow!("Failed to spawn scrcpy server shell: {}", e));
        }
    };

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

    let connect_fut = async {
        // 1. Accept video stream socket with timeout
        let (mut video_socket, _) = tokio::time::timeout(
            tokio::time::Duration::from_secs(10),
            listener.accept(),
        )
        .await
        .map_err(|_| anyhow!("Timeout waiting for video socket connection from scrcpy server (10s)"))?
        .map_err(|e| anyhow!("Accept failed for video socket: {}", e))?;
        let _ = video_socket.set_nodelay(true);

        // 2. Accept audio stream socket if audio requested
        let audio_socket = if settings.audio {
            let (mut audio_sock, _) = tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                listener.accept(),
            )
            .await
            .map_err(|_| anyhow!("Timeout waiting for audio socket connection (5s)"))?
            .map_err(|e| anyhow!("Accept failed for audio socket: {}", e))?;
            let _ = audio_sock.set_nodelay(true);

            let mut audio_codec_buf = [0u8; 4];
            tokio::time::timeout(
                tokio::time::Duration::from_secs(5),
                audio_sock.read_exact(&mut audio_codec_buf),
            )
            .await
            .map_err(|_| anyhow!("Timeout reading audio codec metadata"))?
            .map_err(|e| anyhow!("Failed to read audio codec metadata: {}", e))?;

            Some(audio_sock)
        } else {
            None
        };

        // 3. Accept control socket with timeout
        let (control_socket, _) = tokio::time::timeout(
            tokio::time::Duration::from_secs(5),
            listener.accept(),
        )
        .await
        .map_err(|_| anyhow!("Timeout waiting for control socket connection from scrcpy server (5s)"))?
        .map_err(|e| anyhow!("Accept failed for control socket: {}", e))?;
        let _ = control_socket.set_nodelay(true);

        // 4. Read device name, video codec, and screen dimensions with strict timeout
        let mut device_name_buf = [0u8; 64];
        let mut codec_buf = [0u8; 4];
        let mut size_buf = [0u8; 8];

        let read_meta = async {
            video_socket.read_exact(&mut device_name_buf).await?;
            video_socket.read_exact(&mut codec_buf).await?;
            video_socket.read_exact(&mut size_buf).await?;
            Result::<(), std::io::Error>::Ok(())
        };

        tokio::time::timeout(tokio::time::Duration::from_secs(5), read_meta)
            .await
            .map_err(|_| anyhow!("Timeout reading device & video metadata from scrcpy server (5s)"))?
            .map_err(|e| anyhow!("Failed to read video metadata header: {}", e))?;

        let screen_width = u32::from_be_bytes([size_buf[0], size_buf[1], size_buf[2], size_buf[3]]);
        let screen_height = u32::from_be_bytes([size_buf[4], size_buf[5], size_buf[6], size_buf[7]]);

        if screen_width == 0 || screen_height == 0 {
            return Err(anyhow!(
                "Invalid screen dimensions received from scrcpy: {}x{}",
                screen_width,
                screen_height
            ));
        }

        drop(listener);

        Ok((video_socket, audio_socket, control_socket, screen_width, screen_height))
    };

    match connect_fut.await {
        Ok((video_socket, audio_socket, control_socket, screen_width, screen_height)) => {
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
        Err(e) => {
            let _ = server_process.start_kill();
            stop_server(adb, serial, port).await;
            Err(e)
        }
    }
}

pub async fn stop_server(adb: &Adb, serial: &str, port: u16) {
    let _ = adb.remove_reverse(serial, "localabstract:scrcpy").await;
    if port > 0 {
        let _ = adb.remove_forward(serial, port).await;
    }
    adb.kill_scrcpy_server(serial).await;
}
