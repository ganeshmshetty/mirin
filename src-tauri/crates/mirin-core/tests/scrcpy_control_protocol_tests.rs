use byteorder::{BigEndian, ByteOrder};
use mirin_core::scrcpy::control::{
    action_from_str, build_get_clipboard_msg, build_keycode_msg, build_rotate_device_msg,
    build_scroll_msg, build_scroll_msg_float, build_set_clipboard_msg, build_text_msg,
    build_touch_msg, build_touch_msg_with_pressure, chunk_text, encode_scroll, encode_scroll_float,
    get_clipboard, inject_keycode, inject_scroll, inject_text, inject_text_chunked, inject_touch,
    key_action_from_str, normalized_point, scale_point, set_clipboard,
    truncate_to_utf8_byte_limit, ACTION_CANCEL, ACTION_DOWN, ACTION_MOVE, ACTION_UP,
    MAX_CLIPBOARD_BYTES, MSG_TYPE_GET_CLIPBOARD, MSG_TYPE_INJECT_KEYCODE,
    MSG_TYPE_INJECT_SCROLL, MSG_TYPE_INJECT_TEXT, MSG_TYPE_INJECT_TOUCH, MSG_TYPE_ROTATE_DEVICE,
    MSG_TYPE_SET_CLIPBOARD,
};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::Mutex as TokioMutex;

#[test]
fn test_touch_msg_wire_format_down_move_up_cancel() {
    // DOWN event
    let down_msg = build_touch_msg("down", 100, 200, 1080, 1920);
    assert_eq!(down_msg.len(), 32);
    assert_eq!(down_msg[0], MSG_TYPE_INJECT_TOUCH);
    assert_eq!(down_msg[1], ACTION_DOWN);
    assert_eq!(BigEndian::read_u64(&down_msg[2..10]), 0xFFFFFFFFFFFFFFFF);
    assert_eq!(BigEndian::read_u32(&down_msg[10..14]), 100);
    assert_eq!(BigEndian::read_u32(&down_msg[14..18]), 200);
    assert_eq!(BigEndian::read_u16(&down_msg[18..20]), 1080);
    assert_eq!(BigEndian::read_u16(&down_msg[20..22]), 1920);
    assert_eq!(BigEndian::read_u16(&down_msg[22..24]), 0xFFFF); // default pressure
    assert_eq!(BigEndian::read_u32(&down_msg[24..28]), 1); // action_button = PRIMARY
    assert_eq!(BigEndian::read_u32(&down_msg[28..32]), 1); // buttons = PRIMARY

    // MOVE event
    let move_msg = build_touch_msg("move", 150, 250, 1080, 1920);
    assert_eq!(move_msg.len(), 32);
    assert_eq!(move_msg[0], MSG_TYPE_INJECT_TOUCH);
    assert_eq!(move_msg[1], ACTION_MOVE);
    assert_eq!(BigEndian::read_u32(&move_msg[10..14]), 150);
    assert_eq!(BigEndian::read_u32(&move_msg[14..18]), 250);
    assert_eq!(BigEndian::read_u16(&move_msg[22..24]), 0xFFFF); // pressure
    assert_eq!(BigEndian::read_u32(&move_msg[24..28]), 0); // action_button = 0 for MOVE
    assert_eq!(BigEndian::read_u32(&move_msg[28..32]), 1); // buttons = 1

    // UP event
    let up_msg = build_touch_msg("up", 150, 250, 1080, 1920);
    assert_eq!(up_msg.len(), 32);
    assert_eq!(up_msg[0], MSG_TYPE_INJECT_TOUCH);
    assert_eq!(up_msg[1], ACTION_UP);
    assert_eq!(BigEndian::read_u16(&up_msg[22..24]), 0); // pressure = 0 on UP
    assert_eq!(BigEndian::read_u32(&up_msg[24..28]), 1); // action_button = PRIMARY
    assert_eq!(BigEndian::read_u32(&up_msg[28..32]), 0); // buttons = 0 on UP

    // CANCEL event
    let cancel_msg = build_touch_msg("cancel", 150, 250, 1080, 1920);
    assert_eq!(cancel_msg.len(), 32);
    assert_eq!(cancel_msg[1], ACTION_CANCEL);
    assert_eq!(BigEndian::read_u16(&cancel_msg[22..24]), 0);
    assert_eq!(BigEndian::read_u32(&cancel_msg[24..28]), 0);
    assert_eq!(BigEndian::read_u32(&cancel_msg[28..32]), 0);
}

#[test]
fn test_touch_coordinate_clamping() {
    // Out of bounds coordinates clamped to screen_w - 1, screen_h - 1
    let msg = build_touch_msg("down", 5000, 10000, 1080, 1920);
    assert_eq!(BigEndian::read_u32(&msg[10..14]), 1079);
    assert_eq!(BigEndian::read_u32(&msg[14..18]), 1919);

    // Exact edge coordinates
    let edge_msg = build_touch_msg("down", 1079, 1919, 1080, 1920);
    assert_eq!(BigEndian::read_u32(&edge_msg[10..14]), 1079);
    assert_eq!(BigEndian::read_u32(&edge_msg[14..18]), 1919);

    // Zero dimensions
    let zero_msg = build_touch_msg("down", 50, 50, 0, 0);
    assert_eq!(BigEndian::read_u32(&zero_msg[10..14]), 0);
    assert_eq!(BigEndian::read_u32(&zero_msg[14..18]), 0);
}

#[test]
fn test_touch_custom_pressure() {
    // Half pressure
    let p50 = build_touch_msg_with_pressure("down", 100, 200, 1080, 1920, Some(0.5));
    assert_eq!(BigEndian::read_u16(&p50[22..24]), 32768);

    // Zero pressure
    let p0 = build_touch_msg_with_pressure("down", 100, 200, 1080, 1920, Some(0.0));
    assert_eq!(BigEndian::read_u16(&p0[22..24]), 0);

    // Full pressure
    let p100 = build_touch_msg_with_pressure("down", 100, 200, 1080, 1920, Some(1.0));
    assert_eq!(BigEndian::read_u16(&p100[22..24]), 0xFFFF);

    // Out of bounds / NaN pressure
    let p_nan = build_touch_msg_with_pressure("down", 100, 200, 1080, 1920, Some(f32::NAN));
    assert_eq!(BigEndian::read_u16(&p_nan[22..24]), 0);

    let p_high = build_touch_msg_with_pressure("down", 100, 200, 1080, 1920, Some(2.5));
    assert_eq!(BigEndian::read_u16(&p_high[22..24]), 0xFFFF);

    let p_neg = build_touch_msg_with_pressure("down", 100, 200, 1080, 1920, Some(-0.5));
    assert_eq!(BigEndian::read_u16(&p_neg[22..24]), 0);

    // UP event always forces pressure to 0
    let up_with_p = build_touch_msg_with_pressure("up", 100, 200, 1080, 1920, Some(1.0));
    assert_eq!(BigEndian::read_u16(&up_with_p[22..24]), 0);
}

#[test]
fn test_keycode_wire_format_and_actions() {
    // Keycode DOWN packet (14 bytes)
    let key_down = build_keycode_msg("down", 3, 0, 0); // HOME key
    assert_eq!(key_down.len(), 14);
    assert_eq!(key_down[0], MSG_TYPE_INJECT_KEYCODE);
    assert_eq!(key_down[1], ACTION_DOWN);
    assert_eq!(BigEndian::read_u32(&key_down[2..6]), 3);
    assert_eq!(BigEndian::read_u32(&key_down[6..10]), 0);
    assert_eq!(BigEndian::read_u32(&key_down[10..14]), 0);

    // Keycode UP packet with repeat and metastate
    let key_up = build_keycode_msg("UP", 4, 2, 0x0001); // BACK key, shift metastate
    assert_eq!(key_up.len(), 14);
    assert_eq!(key_up[0], MSG_TYPE_INJECT_KEYCODE);
    assert_eq!(key_up[1], ACTION_UP);
    assert_eq!(BigEndian::read_u32(&key_up[2..6]), 4);
    assert_eq!(BigEndian::read_u32(&key_up[6..10]), 2);
    assert_eq!(BigEndian::read_u32(&key_up[10..14]), 1);

    // Case insensitivity & fallback
    assert_eq!(key_action_from_str("down"), ACTION_DOWN);
    assert_eq!(key_action_from_str("DOWN"), ACTION_DOWN);
    assert_eq!(key_action_from_str("up"), ACTION_UP);
    assert_eq!(key_action_from_str("Up"), ACTION_UP);
    assert_eq!(key_action_from_str("invalid"), ACTION_DOWN);
}

#[test]
fn test_scroll_wire_format_and_clamping() {
    let scroll_msg = build_scroll_msg(500, 600, 1080, 1920, -5, 8);
    assert_eq!(scroll_msg.len(), 21);
    assert_eq!(scroll_msg[0], MSG_TYPE_INJECT_SCROLL);
    assert_eq!(BigEndian::read_u32(&scroll_msg[1..5]), 500);
    assert_eq!(BigEndian::read_u32(&scroll_msg[5..9]), 600);
    assert_eq!(BigEndian::read_u16(&scroll_msg[9..11]), 1080);
    assert_eq!(BigEndian::read_u16(&scroll_msg[11..13]), 1920);
    assert_eq!(BigEndian::read_i16(&scroll_msg[13..15]), encode_scroll(-5));
    assert_eq!(BigEndian::read_i16(&scroll_msg[15..17]), encode_scroll(8));
    assert_eq!(BigEndian::read_u32(&scroll_msg[17..21]), 0); // buttons = 0

    // Coordinate clamping on scroll
    let oob_scroll = build_scroll_msg(5000, 8000, 1080, 1920, 0, 0);
    assert_eq!(BigEndian::read_u32(&oob_scroll[1..5]), 1079);
    assert_eq!(BigEndian::read_u32(&oob_scroll[5..9]), 1919);

    // Float scroll message
    let float_msg = build_scroll_msg_float(100, 200, 1080, 1920, -0.75, 1.0);
    assert_eq!(float_msg.len(), 21);
    assert_eq!(BigEndian::read_i16(&float_msg[13..15]), encode_scroll_float(-0.75));
    assert_eq!(BigEndian::read_i16(&float_msg[15..17]), 32767);
}

#[test]
fn test_scroll_fixed_point_encoding_edge_cases() {
    // Extreme int16 values
    assert_eq!(encode_scroll(i16::MIN), -32768);
    assert_eq!(encode_scroll(i16::MAX), 32767);
    assert_eq!(encode_scroll(-100), -32768);
    assert_eq!(encode_scroll(100), 32767);
    assert_eq!(encode_scroll(0), 0);

    // Extreme float values
    assert_eq!(encode_scroll_float(-100.0), -32768);
    assert_eq!(encode_scroll_float(100.0), 32767);
    assert_eq!(encode_scroll_float(f32::NAN), 0);
    assert_eq!(encode_scroll_float(f32::INFINITY), 32767);
    assert_eq!(encode_scroll_float(f32::NEG_INFINITY), -32768);
}

#[test]
fn test_text_chunking_with_multibyte_unicode_and_emojis() {
    // 1. Empty text
    let empty_chunks = chunk_text("", 300);
    assert!(empty_chunks.is_empty());

    // 2. Short ASCII
    let short_chunks = chunk_text("hello world", 300);
    assert_eq!(short_chunks, vec!["hello world"]);

    // 3. Long ASCII (750 chars)
    let long_ascii = "a".repeat(750);
    let ascii_chunks = chunk_text(&long_ascii, 300);
    assert_eq!(ascii_chunks.len(), 3);
    assert_eq!(ascii_chunks[0].len(), 300);
    assert_eq!(ascii_chunks[1].len(), 300);
    assert_eq!(ascii_chunks[2].len(), 150);
    assert_eq!(ascii_chunks.concat(), long_ascii);

    // 4. Multibyte CJK (each character is 3 bytes)
    let cjk_sample = "中文测试".repeat(30); // 120 chars = 360 bytes
    let cjk_chunks = chunk_text(&cjk_sample, 300);
    assert_eq!(cjk_chunks.len(), 2);
    assert_eq!(cjk_chunks[0].len(), 300); // 100 CJK characters (300 bytes)
    assert_eq!(cjk_chunks[1].len(), 60); // 20 CJK characters (60 bytes)
    for c in &cjk_chunks {
        assert!(std::str::from_utf8(c.as_bytes()).is_ok());
    }
    assert_eq!(cjk_chunks.concat(), cjk_sample);

    // 5. 4-Byte Emojis (e.g. 🦀 is 4 bytes)
    let crab_sample = "🦀".repeat(100); // 100 * 4 = 400 bytes
    let crab_chunks = chunk_text(&crab_sample, 300);
    assert_eq!(crab_chunks.len(), 2);
    assert_eq!(crab_chunks[0].len(), 300); // 75 crabs = 300 bytes
    assert_eq!(crab_chunks[1].len(), 100); // 25 crabs = 100 bytes
    for c in &crab_chunks {
        assert!(std::str::from_utf8(c.as_bytes()).is_ok());
    }
    assert_eq!(crab_chunks.concat(), crab_sample);

    // 6. Precise boundary split where a 4-byte character would cross the 300-byte boundary
    // 299 'a's (299 bytes) + 1 '🦀' (4 bytes) = 303 bytes total
    let boundary_str = format!("{}🦀", "a".repeat(299));
    let boundary_chunks = chunk_text(&boundary_str, 300);
    assert_eq!(boundary_chunks.len(), 2);
    assert_eq!(boundary_chunks[0].len(), 299);
    assert_eq!(boundary_chunks[0], "a".repeat(299));
    assert_eq!(boundary_chunks[1].len(), 4);
    assert_eq!(boundary_chunks[1], "🦀");

    // 7. Complex Emoji sequence with Zero-Width-Joiners (e.g. 👨‍👩‍👧‍👦)
    let family_emoji = "👨‍👩‍👧‍👦".repeat(20);
    let family_chunks = chunk_text(&family_emoji, 300);
    for c in &family_chunks {
        assert!(c.len() <= 300);
        assert!(std::str::from_utf8(c.as_bytes()).is_ok());
    }
    assert_eq!(family_chunks.concat(), family_emoji);

    // 8. Control characters in text
    let ctrl_text = "Line 1\r\nLine 2\tTabbed\x00Null\x1bEscape";
    let ctrl_chunks = chunk_text(ctrl_text, 300);
    assert_eq!(ctrl_chunks.len(), 1);
    assert_eq!(ctrl_chunks[0], ctrl_text);
}

#[test]
fn test_text_msg_wire_format() {
    let msg = build_text_msg("test 🦀");
    let payload = "test 🦀".as_bytes();
    assert_eq!(msg.len(), 5 + payload.len());
    assert_eq!(msg[0], MSG_TYPE_INJECT_TEXT);
    assert_eq!(BigEndian::read_u32(&msg[1..5]), payload.len() as u32);
    assert_eq!(&msg[5..], payload);
}

#[test]
fn test_clipboard_wire_format_and_truncation() {
    // Normal clipboard text
    let normal_text = "Hello Android Clipboard!";
    let set_msg = build_set_clipboard_msg(normal_text, false);
    assert_eq!(set_msg.len(), 14 + normal_text.len());
    assert_eq!(set_msg[0], MSG_TYPE_SET_CLIPBOARD);
    assert_eq!(BigEndian::read_u64(&set_msg[1..9]), 0); // sequence = 0
    assert_eq!(set_msg[9], 0); // paste = false
    assert_eq!(BigEndian::read_u32(&set_msg[10..14]), normal_text.len() as u32);
    assert_eq!(&set_msg[14..], normal_text.as_bytes());

    // Paste = true
    let paste_msg = build_set_clipboard_msg(normal_text, true);
    assert_eq!(paste_msg[9], 1);

    // Oversize clipboard text (> 256 KiB) with multi-byte emoji on truncation boundary
    let huge_text = "🦀".repeat(100_000); // 400,000 bytes > 262,144 bytes
    let truncated_str = truncate_to_utf8_byte_limit(&huge_text, MAX_CLIPBOARD_BYTES);
    assert!(truncated_str.len() <= MAX_CLIPBOARD_BYTES);
    assert!(std::str::from_utf8(truncated_str.as_bytes()).is_ok());

    let huge_set_msg = build_set_clipboard_msg(&huge_text, false);
    let payload_len = BigEndian::read_u32(&huge_set_msg[10..14]) as usize;
    assert!(payload_len <= MAX_CLIPBOARD_BYTES);
    assert_eq!(huge_set_msg.len(), 14 + payload_len);

    // Get clipboard msg
    let get_msg = build_get_clipboard_msg(0);
    assert_eq!(get_msg.len(), 2);
    assert_eq!(get_msg[0], MSG_TYPE_GET_CLIPBOARD);
    assert_eq!(get_msg[1], 0);

    // Rotate device msg
    let rotate_msg = build_rotate_device_msg();
    assert_eq!(rotate_msg, vec![MSG_TYPE_ROTATE_DEVICE]);
}

#[tokio::test]
async fn test_async_socket_mock_injection_all_types() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (mut server_sock, _) = listener.accept().await.unwrap();
    let client_mutex = TokioMutex::new(client);

    // 1. Inject Touch
    inject_touch(&client_mutex, "down", 50, 100, 1080, 1920).await.unwrap();
    let mut touch_buf = [0u8; 32];
    server_sock.read_exact(&mut touch_buf).await.unwrap();
    assert_eq!(touch_buf[0], MSG_TYPE_INJECT_TOUCH);
    assert_eq!(touch_buf[1], ACTION_DOWN);

    // 2. Inject Keycode
    inject_keycode(&client_mutex, "up", 26, 0, 0).await.unwrap();
    let mut key_buf = [0u8; 14];
    server_sock.read_exact(&mut key_buf).await.unwrap();
    assert_eq!(key_buf[0], MSG_TYPE_INJECT_KEYCODE);
    assert_eq!(key_buf[1], ACTION_UP);
    assert_eq!(BigEndian::read_u32(&key_buf[2..6]), 26);

    // 3. Inject Text (empty should not write anything)
    inject_text(&client_mutex, "").await.unwrap();

    // 4. Inject Text (single chunk)
    inject_text(&client_mutex, "abc").await.unwrap();
    let mut text_hdr = [0u8; 5];
    server_sock.read_exact(&mut text_hdr).await.unwrap();
    assert_eq!(text_hdr[0], MSG_TYPE_INJECT_TEXT);
    assert_eq!(BigEndian::read_u32(&text_hdr[1..5]), 3);
    let mut text_body = [0u8; 3];
    server_sock.read_exact(&mut text_body).await.unwrap();
    assert_eq!(&text_body, b"abc");

    // 5. Inject Scroll
    inject_scroll(&client_mutex, 100, 200, 1080, 1920, 2, -3).await.unwrap();
    let mut scroll_buf = [0u8; 21];
    server_sock.read_exact(&mut scroll_buf).await.unwrap();
    assert_eq!(scroll_buf[0], MSG_TYPE_INJECT_SCROLL);

    // 6. Set Clipboard
    set_clipboard(&client_mutex, "clipboard text").await.unwrap();
    let mut clip_hdr = [0u8; 14];
    server_sock.read_exact(&mut clip_hdr).await.unwrap();
    assert_eq!(clip_hdr[0], MSG_TYPE_SET_CLIPBOARD);
    let clip_len = BigEndian::read_u32(&clip_hdr[10..14]) as usize;
    let mut clip_body = vec![0u8; clip_len];
    server_sock.read_exact(&mut clip_body).await.unwrap();
    assert_eq!(clip_body, b"clipboard text");
}

#[tokio::test]
async fn test_async_chunked_text_injection() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (mut server_sock, _) = listener.accept().await.unwrap();
    let client_mutex = TokioMutex::new(client);

    // Send 500 chars (2 chunks: 300 + 200)
    let long_text = "x".repeat(500);
    tokio::spawn(async move {
        inject_text_chunked(&client_mutex, &long_text).await.unwrap();
    });

    // Receive Chunk 1 (300 bytes)
    let mut hdr1 = [0u8; 5];
    server_sock.read_exact(&mut hdr1).await.unwrap();
    assert_eq!(hdr1[0], MSG_TYPE_INJECT_TEXT);
    assert_eq!(BigEndian::read_u32(&hdr1[1..5]), 300);
    let mut body1 = vec![0u8; 300];
    server_sock.read_exact(&mut body1).await.unwrap();
    assert_eq!(body1, vec![b'x'; 300]);

    // Receive Chunk 2 (200 bytes)
    let mut hdr2 = [0u8; 5];
    server_sock.read_exact(&mut hdr2).await.unwrap();
    assert_eq!(hdr2[0], MSG_TYPE_INJECT_TEXT);
    assert_eq!(BigEndian::read_u32(&hdr2[1..5]), 200);
    let mut body2 = vec![0u8; 200];
    server_sock.read_exact(&mut body2).await.unwrap();
    assert_eq!(body2, vec![b'x'; 200]);
}

#[tokio::test]
async fn test_async_get_clipboard_success_and_empty() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (mut server_sock, _) = listener.accept().await.unwrap();
    let client_mutex = TokioMutex::new(client);

    // Handle normal clipboard reply
    tokio::spawn(async move {
        // Read get clipboard request (2 bytes)
        let mut req = [0u8; 2];
        server_sock.read_exact(&mut req).await.unwrap();
        assert_eq!(req[0], MSG_TYPE_GET_CLIPBOARD);

        // Send reply: type=0 (CLIPBOARD), len=11, text="Hello World"
        let text = "Hello World";
        let mut resp = vec![0u8]; // msg type = 0
        resp.extend_from_slice(&(text.len() as u32).to_be_bytes());
        resp.extend_from_slice(text.as_bytes());
        server_sock.write_all(&resp).await.unwrap();
    });

    let text = get_clipboard(&client_mutex).await.unwrap();
    assert_eq!(text, "Hello World");
}

#[tokio::test]
async fn test_async_get_clipboard_oversize_response_rejected() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (mut server_sock, _) = listener.accept().await.unwrap();
    let client_mutex = TokioMutex::new(client);

    tokio::spawn(async move {
        let mut req = [0u8; 2];
        server_sock.read_exact(&mut req).await.unwrap();

        // Send reply with length claiming 50 MB (exceeds MAX_CLIPBOARD_BYTES)
        let mut resp = vec![0u8];
        resp.extend_from_slice(&(50 * 1024 * 1024u32).to_be_bytes());
        server_sock.write_all(&resp).await.unwrap();
    });

    let res = get_clipboard(&client_mutex).await;
    assert!(res.is_err());
    let err_msg = res.unwrap_err().to_string();
    assert!(err_msg.contains("exceeds maximum limit"));
}

#[tokio::test]
async fn test_async_get_clipboard_unexpected_message_type() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (mut server_sock, _) = listener.accept().await.unwrap();
    let client_mutex = TokioMutex::new(client);

    tokio::spawn(async move {
        let mut req = [0u8; 2];
        server_sock.read_exact(&mut req).await.unwrap();

        // Send reply with unexpected message type (e.g. 99)
        let mut resp = vec![99u8];
        resp.extend_from_slice(&0u32.to_be_bytes());
        server_sock.write_all(&resp).await.unwrap();
    });

    let res = get_clipboard(&client_mutex).await;
    assert!(res.is_err());
    assert!(res.unwrap_err().to_string().contains("Unexpected device message type"));
}

#[test]
fn test_action_from_str_and_key_action_from_str_matrix() {
    // Touch actions
    assert_eq!(action_from_str("down"), ACTION_DOWN);
    assert_eq!(action_from_str("DOWN"), ACTION_DOWN);
    assert_eq!(action_from_str("  Down  "), ACTION_DOWN);
    assert_eq!(action_from_str("move"), ACTION_MOVE);
    assert_eq!(action_from_str("MOVE"), ACTION_MOVE);
    assert_eq!(action_from_str("  Move "), ACTION_MOVE);
    assert_eq!(action_from_str("up"), ACTION_UP);
    assert_eq!(action_from_str("UP"), ACTION_UP);
    assert_eq!(action_from_str("cancel"), ACTION_CANCEL);
    assert_eq!(action_from_str("CANCEL"), ACTION_CANCEL);
    assert_eq!(action_from_str("unknown_action"), ACTION_DOWN);

    // Key actions
    assert_eq!(key_action_from_str("up"), ACTION_UP);
    assert_eq!(key_action_from_str("UP"), ACTION_UP);
    assert_eq!(key_action_from_str("down"), ACTION_DOWN);
    assert_eq!(key_action_from_str("DOWN"), ACTION_DOWN);
    assert_eq!(key_action_from_str("other"), ACTION_DOWN);
}

#[test]
fn test_scale_point_and_normalized_point_matrix() {
    // Scale point normal cases
    assert_eq!(scale_point(0.0, 0.0, 1080, 1920, 720, 1280), (0, 0));
    assert_eq!(scale_point(540.0, 960.0, 1080, 1920, 720, 1280), (360, 640));
    assert_eq!(scale_point(1079.0, 1919.0, 1080, 1920, 720, 1280), (719, 1279));

    // Scale point negative and out of bounds
    assert_eq!(scale_point(-50.0, -100.0, 1080, 1920, 720, 1280), (0, 0));
    assert_eq!(scale_point(9999.0, 9999.0, 1080, 1920, 720, 1280), (719, 1279));

    // Zero dimensions
    assert_eq!(scale_point(100.0, 100.0, 0, 1920, 720, 1280), (0, 0));
    assert_eq!(scale_point(100.0, 100.0, 1080, 0, 720, 1280), (0, 0));
    assert_eq!(scale_point(100.0, 100.0, 1080, 1920, 0, 1280), (0, 0));
    assert_eq!(scale_point(100.0, 100.0, 1080, 1920, 720, 0), (0, 0));

    // Normalized point normal cases
    assert_eq!(normalized_point(0.0, 0.0, 720, 1280), (0, 0));
    assert_eq!(normalized_point(0.5, 0.5, 720, 1280), (360, 640));
    assert_eq!(normalized_point(1.0, 1.0, 720, 1280), (719, 1279));

    // Normalized point clamping
    assert_eq!(normalized_point(-1.0, -2.0, 720, 1280), (0, 0));
    assert_eq!(normalized_point(2.0, 5.0, 720, 1280), (719, 1279));
    assert_eq!(normalized_point(f32::NAN, f32::INFINITY, 720, 1280), (0, 1279));
}

#[tokio::test]
async fn test_auto_chunking_when_inject_text_called_with_large_payload() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    let client = TcpStream::connect(format!("127.0.0.1:{}", port)).await.unwrap();
    let (mut server_sock, _) = listener.accept().await.unwrap();
    let client_mutex = TokioMutex::new(client);

    // Call inject_text with 700 bytes (should chunk into 300 + 300 + 100)
    let payload = "y".repeat(700);
    tokio::spawn(async move {
        inject_text(&client_mutex, &payload).await.unwrap();
    });

    // Chunk 1: 300 bytes
    let mut hdr1 = [0u8; 5];
    server_sock.read_exact(&mut hdr1).await.unwrap();
    assert_eq!(BigEndian::read_u32(&hdr1[1..5]), 300);
    let mut body1 = vec![0u8; 300];
    server_sock.read_exact(&mut body1).await.unwrap();
    assert_eq!(body1, vec![b'y'; 300]);

    // Chunk 2: 300 bytes
    let mut hdr2 = [0u8; 5];
    server_sock.read_exact(&mut hdr2).await.unwrap();
    assert_eq!(BigEndian::read_u32(&hdr2[1..5]), 300);
    let mut body2 = vec![0u8; 300];
    server_sock.read_exact(&mut body2).await.unwrap();
    assert_eq!(body2, vec![b'y'; 300]);

    // Chunk 3: 100 bytes
    let mut hdr3 = [0u8; 5];
    server_sock.read_exact(&mut hdr3).await.unwrap();
    assert_eq!(BigEndian::read_u32(&hdr3[1..5]), 100);
    let mut body3 = vec![0u8; 100];
    server_sock.read_exact(&mut body3).await.unwrap();
    assert_eq!(body3, vec![b'y'; 100]);
}
