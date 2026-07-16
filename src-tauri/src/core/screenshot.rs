use anyhow::Result;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::io::Cursor;
use std::path::PathBuf;
use crate::core::adb::Adb;
use crate::core::ui_extractor::UiElement;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotResult {
    pub data_base64: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub annotated_elements: Vec<UiElement>,
}

/// Fallback screenshot execution using adb exec-out screencap -p
/// and drawing Set-of-Mark numbered badges on elements if annotate=true.
pub async fn capture_fallback(
    adb_path: PathBuf,
    serial: &str,
    elements: Vec<UiElement>,
    annotate: bool,
) -> Result<ScreenshotResult, String> {
    let adb = Adb::new(adb_path).with_device(serial);
    let png_bytes = adb.execute_bytes(&["exec-out", "screencap", "-p"]).await?;

    if !annotate || elements.is_empty() {
        let img = image::load_from_memory(&png_bytes)
            .map_err(|e| format!("Failed to decode screencap PNG: {}", e))?;
        let (w, h) = (img.width(), img.height());
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png_bytes);
        return Ok(ScreenshotResult {
            data_base64: b64,
            mime_type: "image/png".to_string(),
            width: w,
            height: h,
            annotated_elements: elements,
        });
    }

    // Draw SOM boxes on fallback PNG
    let mut img = image::load_from_memory(&png_bytes)
        .map_err(|e| format!("Failed to decode screencap PNG for SOM: {}", e))?
        .to_rgba8();

    let (width, height) = img.dimensions();
    let colors = [
        image::Rgba([0, 255, 255, 255]),   // Cyan
        image::Rgba([255, 255, 0, 255]),   // Yellow
        image::Rgba([255, 50, 255, 255]),  // Magenta
        image::Rgba([50, 255, 100, 255]),  // Green
        image::Rgba([255, 150, 0, 255]),   // Orange
    ];

    for (idx, el) in elements.iter().enumerate() {
        let (x1, y1, x2, y2) = el.bounds;
        if x1 >= x2 || y1 >= y2 || x1 < 0 || y1 < 0 {
            continue;
        }
        let ux1 = (x1 as u32).min(width.saturating_sub(1));
        let uy1 = (y1 as u32).min(height.saturating_sub(1));
        let ux2 = (x2 as u32).min(width.saturating_sub(1));
        let uy2 = (y2 as u32).min(height.saturating_sub(1));

        let color = colors[idx % colors.len()];
        let border_thickness = 3;

        for t in 0..border_thickness {
            let bx1 = ux1.saturating_add(t).min(ux2);
            let by1 = uy1.saturating_add(t).min(uy2);
            let bx2 = ux2.saturating_sub(t).max(bx1);
            let by2 = uy2.saturating_sub(t).max(by1);

            for x in bx1..=bx2 {
                img.put_pixel(x, by1, color);
                img.put_pixel(x, by2, color);
            }
            for y in by1..=by2 {
                img.put_pixel(bx1, y, color);
                img.put_pixel(bx2, y, color);
            }
        }

        // Badge box corner with number
        let num = idx + 1;
        let num_str = num.to_string();
        let digit_count = num_str.len() as u32;
        let char_w = 7u32;
        let char_h = 11u32;
        let pad = 4u32;
        let badge_w = (char_w * digit_count + pad * 2).min(ux2.saturating_sub(ux1));
        let badge_h = (char_h + pad * 2).min(uy2.saturating_sub(uy1));
        for bx in ux1..ux1.saturating_add(badge_w) {
            for by in uy1..uy1.saturating_add(badge_h) {
                if bx < width && by < height {
                    img.put_pixel(
                        bx,
                        by,
                        image::Rgba([color.0[0] / 2, color.0[1] / 2, color.0[2] / 2, 230]),
                    );
                }
            }
        }
        // Draw number into badge
        let dot_x = ux1 + pad;
        let dot_y = uy1 + pad;
        for (ci, ch) in num_str.chars().enumerate() {
            if ch.is_ascii_digit() {
                if let Some(rows) = digit_bitmap(ch as u8 - b'0') {
                    let cx = dot_x + ci as u32 * char_w;
                    for (row, &row_bits) in rows.iter().enumerate() {
                        for col_bit in 0..char_w {
                            if row_bits & (1 << (char_w - 1 - col_bit)) != 0 {
                                let px = cx + col_bit;
                                let py = dot_y + row as u32;
                                if px < width && py < height {
                                    img.put_pixel(px, py, image::Rgba([255, 255, 255, 255]));
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    let mut out_buf = Vec::new();
    let mut cursor = Cursor::new(&mut out_buf);
    image::DynamicImage::ImageRgba8(img)
        .write_to(&mut cursor, image::ImageFormat::Png)
        .map_err(|e| format!("Failed to encode annotated SOM PNG: {}", e))?;

    let b64 = base64::engine::general_purpose::STANDARD.encode(&out_buf);
    Ok(ScreenshotResult {
        data_base64: b64,
        mime_type: "image/png".to_string(),
        width,
        height,
        annotated_elements: elements,
    })
}

/// 7x11 pixel bitmap font for digits 0-9. Each entry is [row0, row1, ..., row10].
fn digit_bitmap(d: u8) -> Option<[u8; 11]> {
    match d {
        0 => Some([0b0111110, 0b1111111, 0b1100011, 0b1100011, 0b1100011, 0b1100011, 0b1100011, 0b1100011, 0b1100011, 0b1111111, 0b0111110]),
        1 => Some([0b0011000, 0b0111000, 0b1111000, 0b0011000, 0b0011000, 0b0011000, 0b0011000, 0b0011000, 0b0011000, 0b0011000, 0b1111111]),
        2 => Some([0b0111110, 0b1111111, 0b1100011, 0b0000011, 0b0000111, 0b0001110, 0b0011100, 0b0111000, 0b1110000, 0b1111111, 0b1111111]),
        3 => Some([0b0111110, 0b1111111, 0b1100011, 0b0000011, 0b0001111, 0b0001111, 0b0000011, 0b1100011, 0b1100011, 0b1111111, 0b0111110]),
        4 => Some([0b0000110, 0b0001110, 0b0011110, 0b0110110, 0b1100110, 0b1100110, 0b1111111, 0b1111111, 0b0000110, 0b0000110, 0b0000110]),
        5 => Some([0b1111111, 0b1111111, 0b1100000, 0b1111110, 0b1111111, 0b0000011, 0b0000011, 0b0000011, 0b1100011, 0b1111111, 0b0111110]),
        6 => Some([0b0011110, 0b0111111, 0b1110000, 0b1100000, 0b1111110, 0b1111111, 0b1100011, 0b1100011, 0b1100011, 0b1111111, 0b0111110]),
        7 => Some([0b1111111, 0b1111111, 0b0000011, 0b0000110, 0b0001100, 0b0011000, 0b0110000, 0b0110000, 0b0110000, 0b0110000, 0b0110000]),
        8 => Some([0b0111110, 0b1111111, 0b1100011, 0b1100011, 0b1111111, 0b0111110, 0b1100011, 0b1100011, 0b1100011, 0b1111111, 0b0111110]),
        9 => Some([0b0111110, 0b1111111, 0b1100011, 0b1100011, 0b1100011, 0b1111111, 0b0111111, 0b0000011, 0b0000111, 0b1111110, 0b0111100]),
        _ => None,
    }
}
