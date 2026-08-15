use mirin_core::scrcpy::{
    control,
    stream::{start_server, EmbeddedStreamSettings},
    video::{parse_h264_config, split_nals},
    EmbeddedScrcpyState, EmbeddedSessionInfo,
};
use mirin_core::adb::Adb;
use std::path::PathBuf;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{Mutex as TokioMutex, Notify};

#[tokio::test]
async fn test_state_concurrent_rapid_lifecycle() {
    let state = EmbeddedScrcpyState::new();

    // Create a mock listener for dummy TcpStreams
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let server_task = tokio::spawn(async move {
        while let Ok((socket, _)) = listener.accept().await {
            tokio::spawn(async move {
                let _ = socket;
            });
        }
    });

    let mut handles = Vec::new();
    for i in 0..20 {
        let state_clone = state.clone();
        let handle = tokio::spawn(async move {
            let serial = format!("device_{}", i % 4);
            let lock = state_clone.lock_device_connect(&serial).await;
            let _guard = lock.lock().await;

            let socket = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
            let shutdown = Arc::new(Notify::new());

            // Spawn a dummy process to hold Child handle
            let dummy_child = tokio::process::Command::new("true")
                .spawn()
                .unwrap();

            let session = EmbeddedSessionInfo {
                session_id: state_clone.next_session_id(),
                control_socket: Arc::new(TokioMutex::new(socket)),
                shutdown_notify: shutdown.clone(),
                screen_width: 1080,
                screen_height: 1920,
                port: 1234,
                server_process: dummy_child,
            };

            state_clone.add_session(serial.clone(), session).unwrap();
            assert!(state_clone.is_session_active(&serial));
            assert!(state_clone.get_session_info(&serial).is_ok());

            if i % 2 == 0 {
                let removed = state_clone.remove_session(&serial).unwrap();
                assert!(removed.is_some());
            }
        });
        handles.push(handle);
    }

    for h in handles {
        h.await.unwrap();
    }

    server_task.abort();
    assert!(state.stop_all().is_ok());
    assert_eq!(state.get_active_serials().len(), 0);
}

#[tokio::test]
async fn test_state_replaces_and_notifies_previous_session() {
    let state = EmbeddedScrcpyState::new();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let sock1 = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let notify1 = Arc::new(Notify::new());
    let child1 = tokio::process::Command::new("true").spawn().unwrap();

    let session1 = EmbeddedSessionInfo {
        session_id: state.next_session_id(),
        control_socket: Arc::new(TokioMutex::new(sock1)),
        shutdown_notify: notify1.clone(),
        screen_width: 1080,
        screen_height: 1920,
        port: 1001,
        server_process: child1,
    };

    state.add_session("dev1".to_string(), session1).unwrap();

    let notified_flag = Arc::new(std::sync::atomic::AtomicBool::new(false));
    let notified_clone = notified_flag.clone();
    let n1 = notify1.clone();
    tokio::spawn(async move {
        n1.notified().await;
        notified_clone.store(true, std::sync::atomic::Ordering::SeqCst);
    });

    // Give the notify waiter a moment to register
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;

    let sock2 = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let notify2 = Arc::new(Notify::new());
    let child2 = tokio::process::Command::new("true").spawn().unwrap();

    let session2 = EmbeddedSessionInfo {
        session_id: state.next_session_id(),
        control_socket: Arc::new(TokioMutex::new(sock2)),
        shutdown_notify: notify2,
        screen_width: 720,
        screen_height: 1280,
        port: 1002,
        server_process: child2,
    };

    // Replacing session for "dev1" should trigger notify_waiters on old shutdown_notify
    state.add_session("dev1".to_string(), session2).unwrap();

    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    assert!(notified_flag.load(std::sync::atomic::Ordering::SeqCst));

    let (_sock, w, h) = state.get_session_info("dev1").unwrap();
    assert_eq!(w, 720);
    assert_eq!(h, 1280);
}

#[tokio::test]
async fn test_state_stop_if_match_prevents_stale_teardown() {
    let state = EmbeddedScrcpyState::new();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let sock1 = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let notify1 = Arc::new(Notify::new());
    let child1 = tokio::process::Command::new("true").spawn().unwrap();
    let session_id_1 = state.next_session_id();

    let session1 = EmbeddedSessionInfo {
        session_id: session_id_1,
        control_socket: Arc::new(TokioMutex::new(sock1)),
        shutdown_notify: notify1.clone(),
        screen_width: 1080,
        screen_height: 1920,
        port: 1001,
        server_process: child1,
    };

    state.add_session("dev_match".to_string(), session1).unwrap();

    let sock2 = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let notify2 = Arc::new(Notify::new());
    let child2 = tokio::process::Command::new("true").spawn().unwrap();
    let session_id_2 = state.next_session_id();

    let session2 = EmbeddedSessionInfo {
        session_id: session_id_2,
        control_socket: Arc::new(TokioMutex::new(sock2)),
        shutdown_notify: notify2.clone(),
        screen_width: 720,
        screen_height: 1280,
        port: 1002,
        server_process: child2,
    };

    // Replace session 1 with session 2
    state.add_session("dev_match".to_string(), session2).unwrap();

    let adb = Adb::new(PathBuf::from("/nonexistent/adb"));

    // Attempting to stop with stale session_id_1 should return false and NOT remove session 2
    let stopped = state.stop_if_match(&adb, "dev_match", session_id_1).await.unwrap();
    assert!(!stopped);
    assert!(state.is_session_active("dev_match"));
    let (_, w, _) = state.get_session_info("dev_match").unwrap();
    assert_eq!(w, 720); // Session 2 is intact!

    // Stopping with current session_id_2 should succeed and remove session 2
    let stopped = state.stop_if_match(&adb, "dev_match", session_id_2).await.unwrap();
    assert!(stopped);
    assert!(!state.is_session_active("dev_match"));
}

#[tokio::test]
async fn test_start_server_nonexistent_jar_fails_fast() {
    let adb = Adb::new(PathBuf::from("/nonexistent/adb"));
    let bad_path = PathBuf::from("/nonexistent/scrcpy-server.jar");
    let settings = EmbeddedStreamSettings::default();

    let res = start_server(&adb, "dummy_serial", &bad_path, "3.3.4", &settings).await;
    assert!(res.is_err());
    let err_msg = res.err().unwrap().to_string();
    assert!(err_msg.contains("scrcpy-server.jar not found"));
}

#[tokio::test]
async fn test_start_server_invalid_codec_fails_fast() {
    let adb = Adb::new(PathBuf::from("/nonexistent/adb"));
    // Create a temporary file to satisfy exists() check
    let temp_file = tempfile::NamedTempFile::new().unwrap();
    let mut settings = EmbeddedStreamSettings::default();
    settings.video_codec = "av1_unsupported".to_string();

    let res = start_server(&adb, "dummy_serial", temp_file.path(), "3.3.4", &settings).await;
    assert!(res.is_err());
    let err_msg = res.err().unwrap().to_string();
    assert!(err_msg.contains("Unsupported video codec"));
}

#[test]
fn test_video_nal_splitting_and_parsing() {
    // Construct dummy H264 SPS & PPS NAL units
    // SPS: start code [0, 0, 0, 1], nal_type 7 (0x67), profile 0x42, compat 0x00, level 0x1e
    let sps_nal = [0x67, 0x42, 0x00, 0x1E, 0x01, 0x02];
    let pps_nal = [0x68, 0xCE, 0x38, 0x80];

    let mut stream_data = Vec::new();
    stream_data.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
    stream_data.extend_from_slice(&sps_nal);
    stream_data.extend_from_slice(&[0x00, 0x00, 0x00, 0x01]);
    stream_data.extend_from_slice(&pps_nal);

    let nals = split_nals(&stream_data);
    assert_eq!(nals.len(), 2);
    assert_eq!(nals[0], &sps_nal);
    assert_eq!(nals[1], &pps_nal);

    let (codec, avcc): (String, Vec<u8>) = parse_h264_config(&nals);
    assert_eq!(codec, "avc1.42001e");
    assert!(!avcc.is_empty());
    assert_eq!(avcc[0], 1); // configurationVersion
}

#[tokio::test]
async fn test_control_timeout_on_unresponsive_socket() {
    // Test that control write operations don't hang if the peer socket is not reading
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (_server_sock, _) = listener.accept().await.unwrap();

    let client_mutex = TokioMutex::new(client);

    // Normal injection should succeed quickly
    let touch_res = control::inject_touch(&client_mutex, "down", 100, 200, 1080, 1920).await;
    assert!(touch_res.is_ok());

    let key_res = control::inject_keycode(&client_mutex, "down", 3, 0, 0).await;
    assert!(key_res.is_ok());

    let text_res = control::inject_text(&client_mutex, "hello").await;
    assert!(text_res.is_ok());

    let scroll_res = control::inject_scroll(&client_mutex, 100, 200, 1080, 1920, 0, 10).await;
    assert!(scroll_res.is_ok());
}

#[tokio::test]
async fn test_stream_video_channel_send_error_fast_exit() {
    use mirin_core::scrcpy::video::{stream_video, FrameEvent, StreamExitReason, VideoCodec};
    use tokio::io::AsyncWriteExt;

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let server_task = tokio::spawn(async move {
        let (mut socket, _) = listener.accept().await.unwrap();
        // Send a config frame header (pts=FLAG_CONFIG, size=10)
        let pts_flags = 1u64 << 63; // FLAG_CONFIG
        let size = 10u32;
        let mut header = [0u8; 12];
        header[0..8].copy_from_slice(&pts_flags.to_be_bytes());
        header[8..12].copy_from_slice(&size.to_be_bytes());
        socket.write_all(&header).await.unwrap();

        // Send dummy NAL payload
        let payload = vec![0x00, 0x00, 0x00, 0x01, 0x67, 0x42, 0x00, 0x1E, 0x01, 0x02];
        socket.write_all(&payload).await.unwrap();

        // Keep socket open so EOF is not hit first
        tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    });

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let shutdown = Arc::new(Notify::new());

    // Closure returns Err simulating dropped Tauri IPC channel (receiver closed)
    let exit_reason = stream_video(
        client,
        |_event: FrameEvent| -> Result<(), String> {
            Err("Receiver dropped / Channel closed".to_string())
        },
        shutdown,
        VideoCodec::H264,
    )
    .await;

    assert_eq!(exit_reason, StreamExitReason::ChannelClosed);
    server_task.abort();
}

#[tokio::test]
async fn test_stream_video_shutdown_signal_fast_exit() {
    use mirin_core::scrcpy::video::{stream_video, FrameEvent, StreamExitReason, VideoCodec};

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let _server_task = tokio::spawn(async move {
        let (_socket, _) = listener.accept().await.unwrap();
        // Just hang
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
    });

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let shutdown = Arc::new(Notify::new());
    let shutdown_clone = shutdown.clone();

    tokio::spawn(async move {
        tokio::time::sleep(std::time::Duration::from_millis(50)).await;
        shutdown_clone.notify_waiters();
    });

    let exit_reason = stream_video(
        client,
        |_event: FrameEvent| -> Result<(), String> { Ok(()) },
        shutdown,
        VideoCodec::H264,
    )
    .await;

    assert_eq!(exit_reason, StreamExitReason::Shutdown);
}

#[tokio::test]
async fn test_stream_video_clean_eof_emits_disconnect() {
    use mirin_core::scrcpy::video::{stream_video, FrameEvent, StreamExitReason, VideoCodec};

    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let server_task = tokio::spawn(async move {
        let (socket, _) = listener.accept().await.unwrap();
        // Immediately close socket to simulate server termination / EOF
        drop(socket);
    });

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let shutdown = Arc::new(Notify::new());

    let disconnected_events = Arc::new(std::sync::Mutex::new(Vec::new()));
    let events_clone = disconnected_events.clone();

    let exit_reason = stream_video(
        client,
        move |event: FrameEvent| -> Result<(), String> {
            events_clone.lock().unwrap().push(event);
            Ok(())
        },
        shutdown,
        VideoCodec::H264,
    )
    .await;

    match exit_reason {
        StreamExitReason::Disconnected(reason) => {
            assert!(reason.contains("Device disconnected") || reason.contains("Stream closed"));
        }
        _ => panic!("Expected Disconnected exit reason, got {:?}", exit_reason),
    }

    let events = disconnected_events.lock().unwrap();
    assert_eq!(events.len(), 1);
    match &events[0] {
        FrameEvent::Disconnected { reason } => {
            assert!(reason.contains("Device disconnected") || reason.contains("Stream closed"));
        }
        _ => panic!("Expected FrameEvent::Disconnected, got {:?}", events[0]),
    }

    server_task.abort();
}
