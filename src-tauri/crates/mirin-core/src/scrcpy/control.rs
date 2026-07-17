use anyhow::Result;
use byteorder::{BigEndian, WriteBytesExt};
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::sync::Mutex;

const MSG_TYPE_INJECT_KEYCODE: u8 = 0;
const MSG_TYPE_INJECT_TEXT: u8 = 1;
const MSG_TYPE_INJECT_TOUCH: u8 = 2;
const MSG_TYPE_INJECT_SCROLL: u8 = 3;
#[allow(dead_code)]
const MSG_TYPE_BACK_OR_SCREEN_ON: u8 = 4;
const MSG_TYPE_GET_CLIPBOARD: u8 = 8;
const MSG_TYPE_SET_CLIPBOARD: u8 = 9;
const MSG_TYPE_ROTATE_DEVICE: u8 = 11;

#[allow(dead_code)]
pub const KEYCODE_HOME: u32 = 3;
#[allow(dead_code)]
pub const KEYCODE_BACK: u32 = 4;
#[allow(dead_code)]
pub const KEYCODE_POWER: u32 = 26;
#[allow(dead_code)]
pub const KEYCODE_VOLUME_UP: u32 = 24;
#[allow(dead_code)]
pub const KEYCODE_VOLUME_DOWN: u32 = 25;
#[allow(dead_code)]
pub const KEYCODE_APP_SWITCH: u32 = 187;
#[allow(dead_code)]
pub const KEYCODE_WAKEUP: u32 = 224;

const ACTION_DOWN: u8 = 0;
const ACTION_UP: u8 = 1;
const ACTION_MOVE: u8 = 2;

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
    let scale = |value: f32, source: u32, target: u32| {
        if source == 0 || target == 0 {
            return 0;
        }
        ((value.clamp(0.0, (source - 1) as f32) / source as f32) * target as f32)
            .round()
            .min((target - 1) as f32) as u32
    };

    (
        scale(x, source_width, target_width),
        scale(y, source_height, target_height),
    )
}

pub fn normalized_point(x: f32, y: f32, target_width: u32, target_height: u32) -> (u32, u32) {
    let scale = |value: f32, target: u32| {
        if target == 0 {
            return 0;
        }
        (value.clamp(0.0, 1.0) * (target - 1) as f32).round() as u32
    };
    (scale(x, target_width), scale(y, target_height))
}

/// Encode scrcpy's scroll range (-16..=16) as signed 16-bit fixed-point.
fn encode_scroll(value: i16) -> i16 {
    ((value.clamp(-16, 16) as f32 / 16.0) * 32767.0).round() as i16
}

fn action_from_str(s: &str) -> u8 {
    match s {
        "down" => ACTION_DOWN,
        "up" => ACTION_UP,
        "move" => ACTION_MOVE,
        _ => ACTION_DOWN,
    }
}

fn build_touch_msg(action: &str, x: u32, y: u32, screen_w: u16, screen_h: u16) -> Vec<u8> {
    let mut buf: Vec<u8> = Vec::with_capacity(32);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_TOUCH).unwrap();
    WriteBytesExt::write_u8(&mut buf, action_from_str(action)).unwrap();
    WriteBytesExt::write_u64::<BigEndian>(&mut buf, 0xFFFFFFFFFFFFFFFF).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, x).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, y).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_w).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_h).unwrap();
    let pressure: u16 = if action == "up" { 0 } else { 0xFFFF };
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, pressure).unwrap();
    let action_button: u32 = if action == "move" { 0 } else { 1 };
    let buttons: u32 = if action == "up" { 0 } else { 1 };
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, action_button).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, buttons).unwrap();
    buf
}

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
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn inject_keycode(
    socket: &Mutex<TcpStream>,
    action: &str,
    keycode: u32,
    repeat: u32,
    metastate: u32,
) -> Result<()> {
    let mut buf: Vec<u8> = Vec::with_capacity(14);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_KEYCODE).unwrap();
    WriteBytesExt::write_u8(&mut buf, action_from_str(action)).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, keycode).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, repeat).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, metastate).unwrap();

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn inject_text(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    let bytes = text.as_bytes();
    let mut buf: Vec<u8> = Vec::with_capacity(5 + bytes.len());
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_TEXT).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, bytes.len() as u32).unwrap();
    std::io::Write::write_all(&mut buf, bytes).unwrap();

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

/// Send text in protocol-sized UTF-8 chunks. scrcpy limits a single injected
/// text message to 300 characters/bytes, and chunks must never split a UTF-8
/// code point.
pub async fn inject_text_chunked(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    let mut chunk = String::new();
    for ch in text.chars() {
        if !chunk.is_empty() && chunk.len() + ch.len_utf8() > 300 {
            inject_text(socket, &chunk).await?;
            chunk.clear();
        }
        chunk.push(ch);
    }
    if !chunk.is_empty() {
        inject_text(socket, &chunk).await?;
    }
    Ok(())
}

#[allow(dead_code)]
pub async fn rotate_device(socket: &Mutex<TcpStream>) -> Result<()> {
    let buf = vec![MSG_TYPE_ROTATE_DEVICE];
    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn set_clipboard(socket: &Mutex<TcpStream>, text: &str) -> Result<()> {
    let bytes = text.as_bytes();
    let mut buf: Vec<u8> = Vec::with_capacity(14 + bytes.len());
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_SET_CLIPBOARD).unwrap();
    WriteBytesExt::write_u64::<BigEndian>(&mut buf, 0).unwrap(); // sequence = 0 (no ack)
    WriteBytesExt::write_u8(&mut buf, 0).unwrap(); // paste = false
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, bytes.len() as u32).unwrap();
    std::io::Write::write_all(&mut buf, bytes).unwrap();

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

pub async fn get_clipboard(socket: &Mutex<TcpStream>) -> Result<String> {
    let mut buf: Vec<u8> = Vec::with_capacity(2);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_GET_CLIPBOARD).unwrap();
    WriteBytesExt::write_u8(&mut buf, 0).unwrap(); // copy_key = NONE

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;

    // Read the 5-byte response header with a timeout to avoid hanging
    let mut header = [0u8; 5];
    tokio::time::timeout(Duration::from_secs(3), stream.read_exact(&mut header))
        .await
        .map_err(|_| anyhow::anyhow!("Clipboard get timed out (scrcpy server did not respond)"))?
        .map_err(|e| anyhow::anyhow!("Clipboard read error: {}", e))?;

    if header[0] != 0 {
        return Err(anyhow::anyhow!(
            "Unexpected device message type: {}",
            header[0]
        ));
    }
    let len = u32::from_be_bytes([header[1], header[2], header[3], header[4]]) as usize;
    let mut text_bytes = vec![0u8; len];
    if len > 0 {
        tokio::time::timeout(Duration::from_secs(3), stream.read_exact(&mut text_bytes))
            .await
            .map_err(|_| anyhow::anyhow!("Clipboard content read timed out"))?
            .map_err(|e| anyhow::anyhow!("Clipboard content read error: {}", e))?;
    }
    let text = String::from_utf8_lossy(&text_bytes).to_string();
    Ok(text)
}

pub async fn inject_scroll(
    socket: &Mutex<TcpStream>,
    x: u32,
    y: u32,
    screen_w: u16,
    screen_h: u16,
    scroll_x: i16,
    scroll_y: i16,
) -> Result<()> {
    let mut buf: Vec<u8> = Vec::with_capacity(21);
    WriteBytesExt::write_u8(&mut buf, MSG_TYPE_INJECT_SCROLL).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, x).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, y).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_w).unwrap();
    WriteBytesExt::write_u16::<BigEndian>(&mut buf, screen_h).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, encode_scroll(scroll_x)).unwrap();
    WriteBytesExt::write_i16::<BigEndian>(&mut buf, encode_scroll(scroll_y)).unwrap();
    WriteBytesExt::write_u32::<BigEndian>(&mut buf, 0).unwrap();

    let mut stream = socket.lock().await;
    stream.write_all(&buf).await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{encode_scroll, scale_point};

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
    }

    #[test]
    fn encodes_scroll_as_scrcpy_fixed_point() {
        assert_eq!(encode_scroll(0), 0);
        assert_eq!(encode_scroll(1), 2048);
        assert_eq!(encode_scroll(-1), -2048);
        assert_eq!(encode_scroll(16), 32767);
        assert_eq!(encode_scroll(-16), -32767);
        assert_eq!(encode_scroll(100), 32767);
    }
}
