use anyhow::Result;
use byteorder::{BigEndian, WriteBytesExt};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

pub const MSG_TYPE_INJECT_KEYCODE: u8 = 0;
pub const MSG_TYPE_INJECT_TEXT: u8 = 1;
pub const MSG_TYPE_INJECT_TOUCH: u8 = 2;
pub const MSG_TYPE_INJECT_SCROLL: u8 = 3;
pub const MSG_TYPE_BACK_OR_SCREEN_ON: u8 = 4;
pub const MSG_TYPE_EXPAND_NOTIFICATION_PANEL: u8 = 5;
pub const MSG_TYPE_EXPAND_SETTINGS_PANEL: u8 = 6;
pub const MSG_TYPE_COLLAPSE_PANELS: u8 = 7;
pub const MSG_TYPE_GET_CLIPBOARD: u8 = 8;
pub const MSG_TYPE_SET_CLIPBOARD: u8 = 9;
pub const MSG_TYPE_SET_SCREEN_POWER_MODE: u8 = 10;
pub const MSG_TYPE_ROTATE_DEVICE: u8 = 11;

pub const KEYCODE_HOME: u32 = 3;
pub const KEYCODE_BACK: u32 = 4;
pub const KEYCODE_VOLUME_UP: u32 = 24;
pub const KEYCODE_VOLUME_DOWN: u32 = 25;
pub const KEYCODE_POWER: u32 = 26;
pub const KEYCODE_APP_SWITCH: u32 = 187;
pub const KEYCODE_WAKEUP: u32 = 224;

pub const ACTION_DOWN: u8 = 0;
pub const ACTION_UP: u8 = 1;
pub const ACTION_MOVE: u8 = 2;
pub const ACTION_CANCEL: u8 = 3;

pub const MAX_INJECT_TEXT_BYTES: usize = 300;
pub const MAX_CLIPBOARD_BYTES: usize = 256 * 1024; // 256 KiB
pub const WRITE_TIMEOUT: Duration = Duration::from_secs(3);
pub const CLIPBOARD_TIMEOUT: Duration = Duration::from_secs(3);

/// Convert a point from the device/UI coordinate space to the dimensions
/// advertised by the active scrcpy video stream.
///
/// scrcpy may scale the video with `max_size`, while ADB/UIAutomator still
/// reports coordinates in the physical display space. Control messages must
/// use the stream dimensions, otherwise selector-based input is offset on
/// devices whose display is larger than the stream.
pub fn scale_point(
    x: f32,
    y: f32,
    source_width: u32,
    source_height: u32,
    target_width: u32,
    target_height: u32,
) -> (u32, u32) {
    if source_width == 0 || source_height == 0 || target_width == 0 || target_height == 0 {
        return (0, 0);
    }
    let scale = |value: f32, source: u32, target: u32| {
        if value.is_nan() {
            return 0;
        }
        let clamped = value.clamp(0.0, (source.saturating_sub(1)) as f32);
        ((clamped / source as f32) * target as f32)
            .round()
            .min(target.saturating_sub(1) as f32)
            .max(0.0) as u32
    };

    (
        scale(x, source_width, target_width),
        scale(y, source_height, target_height),
    )
}

/// Convert normalized coordinates (0.0..=1.0) to absolute target pixel coordinates [0..=target-1].
pub fn normalized_point(x: f32, y: f32, target_width: u32, target_height: u32) -> (u32, u32) {
    if target_width == 0 || target_height == 0 {
        return (0, 0);
    }
    let scale = |value: f32, target: u32| {
        if value.is_nan() {
            return 0;
        }
        let clamped = value.clamp(0.0, 1.0);
        let max_coord = target.saturating_sub(1) as f32;
        (clamped * max_coord).round().min(max_coord).max(0.0) as u32
    };
    (scale(x, target_width), scale(y, target_height))
}

/// Parse a touch action string into its protocol byte representation.
pub fn action_from_str(s: &str) -> u8 {
    match s.trim().to_ascii_lowercase().as_str() {
        "up" => ACTION_UP,
        "move" => ACTION_MOVE,
        "cancel" => ACTION_CANCEL,
        _ => ACTION_DOWN,
    }
}

/// Parse a key action string into its protocol byte representation.
pub fn key_action_from_str(s: &str) -> u8 {
    match s.trim().to_ascii_lowercase().as_str() {
        "up" => ACTION_UP,
        _ => ACTION_DOWN,
    }
}

/// Encode a float scroll delta (-1.0..=1.0) into scrcpy signed 16-bit fixed-point (-0x8000..=0x7fff).
pub fn encode_scroll_float(value: f32) -> i16 {
    if value.is_nan() {
        return 0;
    }
    let clamped = value.clamp(-1.0, 1.0);
    if clamped < 0.0 {
        (clamped * 32768.0).round().clamp(-32768.0, 32767.0) as i16
    } else {
        (clamped * 32767.0).round().clamp(-32768.0, 32767.0) as i16
    }
}

/// Encode scrcpy's scroll range (-16..=16) as signed 16-bit fixed-point.
pub fn encode_scroll(value: i16) -> i16 {
    let clamped = (value.clamp(-16, 16) as f32) / 16.0;
    encode_scroll_float(clamped)
}

/// Truncate a UTF-8 string to a maximum byte limit without splitting multi-byte code points.
pub fn truncate_to_utf8_byte_limit(text: &str, max_bytes: usize) -> &str {
    if text.len() <= max_bytes {
        return text;
    }
    let mut boundary = max_bytes;
    while boundary > 0 && !text.is_char_boundary(boundary) {
        boundary -= 1;
    }
    &text[..boundary]
}

/// Split text into UTF-8 chunks strictly respecting Unicode code point boundaries.
pub fn chunk_text(text: &str, max_bytes: usize) -> Vec<String> {
    if text.is_empty() {
        return Vec::new();
    }
    let limit = if max_bytes == 0 {
        MAX_INJECT_TEXT_BYTES
    } else {
        max_bytes
    };

    let mut chunks = Vec::new();
    let mut current_chunk = String::new();

    for ch in text.chars() {
        let ch_len = ch.len_utf8();
        if !current_chunk.is_empty() && current_chunk.len() + ch_len > limit {
            chunks.push(current_chunk);
            current_chunk = String::new();
        }
        current_chunk.push(ch);
    }
    if !current_chunk.is_empty() {
        chunks.push(current_chunk);
    }
    chunks
}

/// Build a binary touch injection packet (32 bytes).
pub fn build_touch_msg(action: &str, x: u32, y: u32, screen_w: u16, screen_h: u16) -> Vec<u8> {
    build_touch_msg_with_pressure(action, x, y, screen_w, screen_h, None)
}

/// Build a binary touch injection packet with optional pressure.
pub fn build_touch_msg_with_pressure(
    action: &str,
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    pressure_opt: Option<f32>,
) -> Vec<u8> {
    let act = action_from_str(action);
    let clamped_x = if screen_w == 0 {
        0
    } else {
        x.min(screen_w.saturating_sub(1) as u32)
    };
    let clamped_y = if screen_h == 0 {
        0
    } else {
        y.min(screen_h.saturating_sub(1) as u32)
    };

    let (default_pressure, action_button, buttons) = match act {
        ACTION_UP => (0u16, 1u32, 0u32),
        ACTION_MOVE => (0xFFFFu16, 0u32, 1u32),
        ACTION_CANCEL => (0u16, 0u32, 0u32),
        _ /* ACTION_DOWN */ => (0xFFFFu16, 1u32, 1u32),
    };

    let pressure = match pressure_opt {
        Some(p) => {
            if act == ACTION_UP || act == ACTION_CANCEL {
                0u16
            } else if p.is_nan() || p <= 0.0 {
                0u16
            } else if p >= 1.0 {
                0xFFFFu16
            } else {
                (p * 65535.0).round() as u16
            }
        }
        None => default_pressure,
    };

    let mut buf: Vec<u8> = Vec::with_capacity(32);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_TOUCH).unwrap();
    WriteBytesExt::write_u8(&mut buf, act).unwrap();
    WriteBytesExt::write_u64::<BigEndian>(&mut buf, 0xFFFFFFFFFFFFFFFF).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, clamped_x).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, clamped_y).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_w).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_h).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, pressure).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, action_button).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, buttons).unwrap();
    buf
}

/// Inject a touch event into the scrcpy control stream.
pub async fn inject_touch(
    socket: &Mutex<TcpStream>,
    action: &str,
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
) -> Result<()> {
    let buf = build_touch_msg(action, x, y, screen_w, screen_h);
    let mut stream = socket.lock().await;
    tokio::time::timeout(WRITE_TIMEOUT, stream.write_all(&buf))
        .await
        .map_err(|_| anyhow::anyhow!("Timeout sending touch event to scrcpy"))?
        .map_err(|e| anyhow::anyhow!("Failed to send touch event: {}", e))?;
    Ok(())
}

/// Build a binary keycode injection packet (14 bytes).
pub fn build_keycode_msg(action: &str, keycode: u32, repeat: u32, metastate: u32) -> Vec<u8> {
    let act = key_action_from_str(action);
    let mut buf: Vec<u8> = Vec::with_capacity(14);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_KEYCODE).unwrap();
    WriteBytesExt::write_u8(&mut buf, act).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, keycode).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, repeat).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, metastate).unwrap();
    buf
}

/// Inject a keycode event into the scrcpy control stream.
pub async fn inject_keycode(
    socket: &Mutex<TcpStream>,
    action: &str,
    keycode: u32,
    repeat: u32,
    metastate: u32,
) -> Result<()> {
    let buf = build_keycode_msg(action, keycode, repeat, metastate);
    let mut stream = socket.lock().await;
    tokio::time::timeout(WRITE_TIMEOUT, stream.write_all(&buf))
        .await
        .map_err(|_| anyhow::anyhow!("Timeout sending keycode event to scrcpy"))?
        .map_err(|e| anyhow::anyhow!("Failed to send keycode event: {}", e))?;
    Ok(())
}

/// Build a binary text injection packet.
pub fn build_text_msg(text: &str) -> Vec<u8> {
    let bytes = text.as_bytes();
    let mut buf: Vec<u8> = Vec::with_capacity(5 + bytes.len());
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_TEXT).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, bytes.len() as u32).unwrap();
    buf.extend_from_slice(bytes);
    buf
}

/// Inject raw text into scrcpy. If text length exceeds `MAX_INJECT_TEXT_BYTES`,
/// it is automatically chunked safely across UTF-8 character boundaries.
pub async fn inject_text(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    if text.is_empty() {
        return Ok(());
    }
    if text.len() > MAX_INJECT_TEXT_BYTES {
        inject_text_chunked(socket, text).await
    } else {
        inject_text_single(socket, text).await
    }
}

/// Send text in protocol-sized UTF-8 chunks. scrcpy limits a single injected
/// text message to 300 characters/bytes, and chunks must never split a UTF-8
/// code point.
pub async fn inject_text_chunked(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    if text.is_empty() {
        return Ok(());
    }
    let chunks = chunk_text(text, MAX_INJECT_TEXT_BYTES);
    for chunk in chunks {
        inject_text_single(socket, &chunk).await?;
    }
    Ok(())
}

async fn inject_text_single(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    if text.is_empty() {
        return Ok(());
    }
    let buf = build_text_msg(text);
    let mut stream = socket.lock().await;
    tokio::time::timeout(WRITE_TIMEOUT, stream.write_all(&buf))
        .await
        .map_err(|_| anyhow::anyhow!("Timeout sending text to scrcpy"))?
        .map_err(|e| anyhow::anyhow!("Failed to send text: {}", e))?;
    Ok(())
}

/// Build rotate device command packet (1 byte).
pub fn build_rotate_device_msg() -> Vec<u8> {
    vec![MSG_TYPE_ROTATE_DEVICE]
}

#[allow(dead_code)]
pub async fn rotate_device(socket: &Mutex<TcpStream>) -> Result<()> {
    let buf = build_rotate_device_msg();
    let mut stream = socket.lock().await;
    tokio::time::timeout(WRITE_TIMEOUT, stream.write_all(&buf))
        .await
        .map_err(|_| anyhow::anyhow!("Timeout sending rotate command to scrcpy"))?
        .map_err(|e| anyhow::anyhow!("Failed to send rotate command: {}", e))?;
    Ok(())
}

/// Build binary set clipboard packet.
pub fn build_set_clipboard_msg(text: &str, paste: bool) -> Vec<u8> {
    let safe_text = truncate_to_utf8_byte_limit(text, MAX_CLIPBOARD_BYTES);
    let bytes = safe_text.as_bytes();
    let mut buf: Vec<u8> = Vec::with_capacity(14 + bytes.len());
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_SET_CLIPBOARD).unwrap();
    WriteBytesExt::write_u64::<BigEndian>(&mut buf, 0).unwrap(); // sequence = 0 (no ack)
    WriteBytesExt::write_u8(&mut buf, if paste { 1 } else { 0 }).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, bytes.len() as u32).unwrap();
    buf.extend_from_slice(bytes);
    buf
}

/// Set clipboard content on device.
pub async fn set_clipboard(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    let buf = build_set_clipboard_msg(text, false);
    let mut stream = socket.lock().await;
    tokio::time::timeout(WRITE_TIMEOUT, stream.write_all(&buf))
        .await
        .map_err(|_| anyhow::anyhow!("Timeout setting clipboard on scrcpy"))?
        .map_err(|e| anyhow::anyhow!("Failed to set clipboard: {}", e))?;
    Ok(())
}

/// Build binary get clipboard request packet (2 bytes).
pub fn build_get_clipboard_msg(copy_key: u8) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::with_capacity(2);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_GET_CLIPBOARD).unwrap();
    WriteBytesExt::write_u8(&mut buf, copy_key).unwrap();
    buf
}

/// Retrieve device clipboard content.
pub async fn get_clipboard(socket: &Mutex<TcpStream>) -> Result<String> {
    let buf = build_get_clipboard_msg(0); // copy_key = NONE

    let mut stream = socket.lock().await;
    tokio::time::timeout(WRITE_TIMEOUT, stream.write_all(&buf))
        .await
        .map_err(|_| anyhow::anyhow!("Timeout requesting clipboard from scrcpy"))?
        .map_err(|e| anyhow::anyhow!("Failed to send clipboard request: {}", e))?;

    // Read the 5-byte response header with a timeout to avoid hanging
    let mut header = [0u8; 5];
    tokio::time::timeout(CLIPBOARD_TIMEOUT, stream.read_exact(&mut header))
        .await
        .map_err(|_| anyhow::anyhow!("Clipboard get timed out (scrcpy server did not respond)"))?
        .map_err(|e| anyhow::anyhow!("Clipboard read error: {}", e))?;

    if header[0] != 0 {
        return Err(anyhow::anyhow!(
            "Unexpected device message type: {} (expected 0 for clipboard)",
            header[0]
        ));
    }
    let len = u32::from_be_bytes([header[1], header[2], header[3], header[4]]) as usize;
    if len > MAX_CLIPBOARD_BYTES {
        return Err(anyhow::anyhow!(
            "Clipboard response length ({len} bytes) exceeds maximum limit of {MAX_CLIPBOARD_BYTES} bytes"
        ));
    }

    if len == 0 {
        return Ok(String::new());
    }

    let mut text_bytes = vec![0u8; len];
    tokio::time::timeout(CLIPBOARD_TIMEOUT, stream.read_exact(&mut text_bytes))
        .await
        .map_err(|_| anyhow::anyhow!("Clipboard content read timed out"))?
        .map_err(|e| anyhow::anyhow!("Clipboard content read error: {}", e))?;

    let text = String::from_utf8_lossy(&text_bytes).to_string();
    Ok(text)
}

/// Build binary scroll injection packet (21 bytes).
pub fn build_scroll_msg(
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    scroll_x: i16,
    scroll_y: i16,
) -> Vec<u8> {
    let clamped_x = if screen_w == 0 {
        0
    } else {
        x.min(screen_w.saturating_sub(1) as u32)
    };
    let clamped_y = if screen_h == 0 {
        0
    } else {
        y.min(screen_h.saturating_sub(1) as u32)
    };
    let mut buf: Vec<u8> = Vec::with_capacity(21);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_SCROLL).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, clamped_x).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, clamped_y).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_w).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_h).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, encode_scroll(scroll_x)).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, encode_scroll(scroll_y)).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, 0).unwrap();
    buf
}

/// Build binary scroll injection packet using normalized float scroll deltas (-1.0..=1.0).
pub fn build_scroll_msg_float(
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    hscroll: f32,
    vscroll: f32,
) -> Vec<u8> {
    let clamped_x = if screen_w == 0 {
        0
    } else {
        x.min(screen_w.saturating_sub(1) as u32)
    };
    let clamped_y = if screen_h == 0 {
        0
    } else {
        y.min(screen_h.saturating_sub(1) as u32)
    };
    let mut buf: Vec<u8> = Vec::with_capacity(21);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_SCROLL).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, clamped_x).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, clamped_y).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_w).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_h).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, encode_scroll_float(hscroll)).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, encode_scroll_float(vscroll)).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, 0).unwrap();
    buf
}

/// Inject a scroll event into scrcpy.
pub async fn inject_scroll(
    socket: &Mutex<TcpStream>,
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    scroll_x: i16,
    scroll_y: i16,
) -> Result<()> {
    let buf = build_scroll_msg(x, y, screen_w, screen_h, scroll_x, scroll_y);
    let mut stream = socket.lock().await;
    tokio::time::timeout(WRITE_TIMEOUT, stream.write_all(&buf))
        .await
        .map_err(|_| anyhow::anyhow!("Timeout sending scroll event to scrcpy"))?
        .map_err(|e| anyhow::anyhow!("Failed to send scroll event: {}", e))?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scales_physical_display_coordinates_to_stream_coordinates() {
        assert_eq!(
            scale_point(720.0, 1280.0, 1440, 2560, 1080, 1920),
            (540, 960)
        );
        assert_eq!(
            scale_point(1439.0, 2559.0, 1440, 2560, 1080, 1920),
            (1079, 1919)
        );
    }

    #[test]
    fn clamps_points_to_the_target_display() {
        assert_eq!(
            scale_point(-10.0, 5000.0, 1440, 2560, 1080, 1920),
            (0, 1919)
        );
        assert_eq!(scale_point(f32::NAN, 100.0, 1440, 2560, 1080, 1920), (0, 75));
        assert_eq!(scale_point(100.0, 100.0, 0, 0, 1080, 1920), (0, 0));
        assert_eq!(scale_point(100.0, 100.0, 1440, 2560, 0, 0), (0, 0));
    }

    #[test]
    fn normalized_point_clamps_properly() {
        assert_eq!(normalized_point(0.0, 0.0, 1080, 1920), (0, 0));
        assert_eq!(normalized_point(0.5, 0.5, 1080, 1920), (540, 960));
        assert_eq!(normalized_point(1.0, 1.0, 1080, 1920), (1079, 1919));
        assert_eq!(normalized_point(-1.0, 2.0, 1080, 1920), (0, 1919));
        assert_eq!(normalized_point(f32::NAN, f32::NAN, 1080, 1920), (0, 0));
    }

    #[test]
    fn encodes_scroll_as_scrcpy_fixed_point() {
        assert_eq!(encode_scroll(0), 0);
        assert_eq!(encode_scroll(1), 2048);
        assert_eq!(encode_scroll(-1), -2048);
        assert_eq!(encode_scroll(16), 32767);
        assert_eq!(encode_scroll(-16), -32768);
        assert_eq!(encode_scroll(100), 32767);
        assert_eq!(encode_scroll(-100), -32768);
        assert_eq!(encode_scroll(i16::MIN), -32768);
        assert_eq!(encode_scroll(i16::MAX), 32767);
    }

    #[test]
    fn encodes_scroll_float_correctly() {
        assert_eq!(encode_scroll_float(0.0), 0);
        assert_eq!(encode_scroll_float(1.0), 32767);
        assert_eq!(encode_scroll_float(-1.0), -32768);
        assert_eq!(encode_scroll_float(0.5), 16384);
        assert_eq!(encode_scroll_float(-0.5), -16384);
        assert_eq!(encode_scroll_float(f32::NAN), 0);
        assert_eq!(encode_scroll_float(f32::INFINITY), 32767);
        assert_eq!(encode_scroll_float(f32::NEG_INFINITY), -32768);
    }
}

