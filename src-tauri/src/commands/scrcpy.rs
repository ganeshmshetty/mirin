use crate::utils;
use mirin_core::adb::Adb;
use mirin_core::scrcpy::{
    self, control,
    stream::{self, EmbeddedStreamSettings},
    video::{self, FrameEvent, VideoCodec},
    EmbeddedScrcpyState, EmbeddedSessionInfo,
};
use std::sync::Arc;
use tauri::{ipc::Channel, State};
use tokio::sync::{Mutex as TokioMutex, Notify};

/// Check if scrcpy is installed/available
#[tauri::command]
pub async fn check_scrcpy_available(app: tauri::AppHandle) -> Result<bool, String> {
    let scrcpy_path = utils::get_scrcpy_path(&app)?;
    Ok(scrcpy::check_available(&scrcpy_path))
}

/// Get scrcpy version
#[tauri::command]
pub async fn get_scrcpy_version(app: tauri::AppHandle) -> Result<String, String> {
    let scrcpy_path = utils::get_scrcpy_path(&app)?;
    let scrcpy_dir = utils::get_scrcpy_dir(&app)?;
    scrcpy::get_version(&scrcpy_path, &scrcpy_dir)
}

/// Connect and stream embedded video using WebCodecs NAL unit forwarding
#[tauri::command]
pub async fn connect_embedded_mirror(
    app: tauri::AppHandle,
    state: State<'_, EmbeddedScrcpyState>,
    device_id: String,
    on_frame: Channel<FrameEvent>,
    settings: Option<EmbeddedStreamSettings>,
) -> Result<(u32, u32), String> {
    // Serialize handshakes for this device — overlapping retries otherwise
    // kill/start scrcpy-server in a tight Device/Terminated loop.
    let device_lock = state.lock_device_connect(&device_id).await;
    let _guard = device_lock.lock().await;

    let opts = settings.unwrap_or_default();
    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path);
    let scrcpy_server_path = utils::get_scrcpy_server_path(&app)?;
    let scrcpy_path = utils::get_scrcpy_path(&app)?;
    let scrcpy_dir = utils::get_scrcpy_dir(&app)?;
    let scrcpy_version =
        tokio::task::spawn_blocking(move || scrcpy::get_version_number(&scrcpy_path, &scrcpy_dir))
            .await
            .map_err(|e| e.to_string())?;

    // If an embedded session is already active for this device, stop it cleanly first.
    // Shutdown notify returns from stream_video without emitting a "disconnected"
    // event so the frontend does not stack a second reconnect on top of this one.
    if let Some(mut session) = state.remove_session(&device_id)? {
        session.shutdown_notify.notify_one();
        let _ = session.server_process.kill();
        stream::stop_server(&adb, &device_id, session.port).await;
        // Brief settle so pkill + reverse cleanup finish before the next reverse bind
        tokio::time::sleep(std::time::Duration::from_millis(150)).await;
    }

    let streams = tokio::time::timeout(
        std::time::Duration::from_secs(10),
        stream::start_server(
            &adb,
            &device_id,
            &scrcpy_server_path,
            &scrcpy_version,
            &opts,
        ),
    )
    .await
    .map_err(|_| "Timeout starting embedded server".to_string())?
    .map_err(|e| format!("Failed to start embedded server: {}", e))?;
    let (width, height) = (streams.screen_width, streams.screen_height);
    let shutdown = Arc::new(Notify::new());
    let shutdown_clone = shutdown.clone();

    let codec = VideoCodec::from_str(&opts.video_codec);
    let video_socket = streams.video_socket;
    tokio::spawn(async move {
        video::stream_video(
            video_socket,
            move |event| {
                let _ = on_frame.send(event);
            },
            shutdown_clone,
            codec,
        )
        .await;
    });

    let session = EmbeddedSessionInfo {
        control_socket: Arc::new(TokioMutex::new(streams.control_socket)),
        shutdown_notify: shutdown,
        screen_width: width,
        screen_height: height,
        port: streams.port,
        server_process: streams.server_process,
    };

    state.add_session(device_id.clone(), session)?;
    Ok((width, height))
}

#[tauri::command]
pub async fn disconnect_embedded_mirror(
    app: tauri::AppHandle,
    state: State<'_, EmbeddedScrcpyState>,
    device_id: String,
) -> Result<(), String> {
    let device_lock = state.lock_device_connect(&device_id).await;
    let _guard = device_lock.lock().await;

    if let Some(mut session) = state.remove_session(&device_id)? {
        session.shutdown_notify.notify_one();
        let _ = session.server_process.kill();
        let adb_path = utils::get_adb_path(&app)?;
        let adb = Adb::new(adb_path);
        stream::stop_server(&adb, &device_id, session.port).await;
    }
    Ok(())
}

/// Lock the device to portrait or landscape orientation. The mirror is
/// restarted by the frontend so the new stream dimensions are negotiated.
#[tauri::command]
pub async fn set_orientation(
    app: tauri::AppHandle,
    ui_extractor: State<'_, mirin_core::ui_extractor::UiExtractor>,
    device_id: String,
    orientation: String,
) -> Result<(), String> {
    let orientation = orientation.trim().to_lowercase();
    if orientation != "portrait" && orientation != "landscape" {
        return Err("orientation must be 'portrait' or 'landscape'".to_string());
    }

    let adb_path = utils::get_adb_path(&app)?;
    let adb = Adb::new(adb_path).with_device(&device_id);
    let (width, height) = ui_extractor
        .get_device_size(&adb, &device_id)
        .await
        .unwrap_or((1, 1));
    let rotation = match orientation.as_str() {
        "portrait" if height >= width => 0,
        "portrait" => 1,
        "landscape" if width >= height => 0,
        "landscape" => 1,
        _ => unreachable!(),
    };
    let rotation_string = rotation.to_string();

    let _ = adb
        .execute(&[
            "shell",
            "settings",
            "put",
            "system",
            "accelerometer_rotation",
            "0",
        ])
        .await;

    let applied = adb
        .execute(&["shell", "wm", "set-user-rotation", "lock", &rotation_string])
        .await
        .is_ok()
        || adb
            .execute(&["shell", "wm", "user-rotation", "lock", &rotation_string])
            .await
            .is_ok()
        || adb
            .execute(&[
                "shell",
                "settings",
                "put",
                "system",
                "user_rotation",
                &rotation_string,
            ])
            .await
            .is_ok();

    if applied {
        Ok(())
    } else {
        Err("Failed to set orientation through WindowManager or system settings".to_string())
    }
}

#[tauri::command]
pub async fn send_touch(
    state: State<'_, EmbeddedScrcpyState>,
    device_id: String,
    action: String,
    x: f32,
    y: f32,
) -> Result<(), String> {
    let (control_socket, width, height) = state.get_session_info(&device_id)?;
    let abs_x = (x.clamp(0.0, 1.0) * width as f32).round() as u32;
    let abs_y = (y.clamp(0.0, 1.0) * height as f32).round() as u32;
    control::inject_touch(
        &control_socket,
        &action,
        abs_x,
        abs_y,
        width as u16,
        height as u16,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_key(
    state: State<'_, EmbeddedScrcpyState>,
    device_id: String,
    keycode: u32,
    action: String,
) -> Result<(), String> {
    let socket = state.get_control_socket(&device_id)?;
    control::inject_keycode(&socket, &action, keycode, 0, 0)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_text(
    state: State<'_, EmbeddedScrcpyState>,
    device_id: String,
    text: String,
) -> Result<(), String> {
    let socket = state.get_control_socket(&device_id)?;
    control::inject_text(&socket, &text)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn send_scroll(
    state: State<'_, EmbeddedScrcpyState>,
    device_id: String,
    x: f32,
    y: f32,
    dx: i16,
    dy: i16,
) -> Result<(), String> {
    let (control_socket, width, height) = state.get_session_info(&device_id)?;
    let abs_x = (x.clamp(0.0, 1.0) * width as f32).round() as u32;
    let abs_y = (y.clamp(0.0, 1.0) * height as f32).round() as u32;
    control::inject_scroll(
        &control_socket,
        abs_x,
        abs_y,
        width as u16,
        height as u16,
        dx,
        dy,
    )
    .await
    .map_err(|e| e.to_string())
}
