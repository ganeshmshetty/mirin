use anyhow::Result;
use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::Cursor;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex as TokioMutex};
use crate::adb::Adb;
use crate::mcp::ui_extractor::{UiElement, UiExtractor};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotResult {
    pub data_base64: String,
    pub mime_type: String,
    pub width: u32,
    pub height: u32,
    pub annotated_elements: Vec<UiElement>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScreenshotPayload {
    pub req_id: String,
    pub device_id: String,
    pub annotate: bool,
    pub elements: Vec<UiElement>,
}

#[derive(Clone)]
pub struct ScreenshotRegistry {
    pending_requests: Arc<TokioMutex<HashMap<String, oneshot::Sender<ScreenshotResult>>>>,
}

impl ScreenshotRegistry {
    pub fn new() -> Self {
        Self {
            pending_requests: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }

    pub async fn capture(
        &self,
        app: &AppHandle,
        ui_extractor: &UiExtractor,
        serial: &str,
        annotate: bool,
    ) -> Result<ScreenshotResult, String> {
        let req_id = uuid::Uuid::new_v4().to_string();
        
        let elements = if annotate {
            match ui_extractor.get_tree(&Adb::new(crate::utils::get_adb_path(app)?).with_device(serial), serial, false, false).await {
                Ok(tree) => tree.elements,
                Err(_) => Vec::new(),
            }
        } else {
            Vec::new()
        };

        let (tx, rx) = oneshot::channel();
        {
            let mut pending = self.pending_requests.lock().await;
            pending.insert(req_id.clone(), tx);
        }

        let payload = ScreenshotPayload {
            req_id: req_id.clone(),
            device_id: serial.to_string(),
            annotate,
            elements: elements.clone(),
        };

        // Try asking active frontend window for screenshot
        if app.emit("request_screenshot", payload).is_ok() {
            if let Ok(Ok(res)) = tokio::time::timeout(Duration::from_millis(1500), rx).await {
                return Ok(res);
            }
        }

        // If timed out or frontend window not open/listening, remove oneshot sender if still pending
        {
            let mut pending = self.pending_requests.lock().await;
            pending.remove(&req_id);
        }

        // Fallback: adb exec-out screencap -p
        let adb_path = crate::utils::get_adb_path(app)?;
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

            // Badge box corner
            let badge_w = 36.min(ux2.saturating_sub(ux1));
            let badge_h = 20.min(uy2.saturating_sub(uy1));
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

    pub async fn complete_request(&self, req_id: String, result: ScreenshotResult) -> Result<(), String> {
        let mut pending = self.pending_requests.lock().await;
        if let Some(tx) = pending.remove(&req_id) {
            let _ = tx.send(result);
            Ok(())
        } else {
            Err(format!("Screenshot request {} not found or timed out", req_id))
        }
    }
}
