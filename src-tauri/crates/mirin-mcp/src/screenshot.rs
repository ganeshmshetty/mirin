use anyhow::Result;
use mirin_core::adb::Adb;
use mirin_core::ui_extractor::{UiElement, UiExtractor};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter};
use tokio::sync::{oneshot, Mutex as TokioMutex};

pub use mirin_core::screenshot::ScreenshotResult;

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

    pub async fn capture<R: tauri::Runtime>(
        &self,
        app: &AppHandle<R>,
        ui_extractor: &UiExtractor,
        serial: &str,
        annotate: bool,
    ) -> Result<ScreenshotResult, String> {
        let req_id = uuid::Uuid::new_v4().to_string();

        let elements = if annotate {
            match ui_extractor
                .get_tree(
                    &Adb::new(crate::utils::get_adb_path(app)?).with_device(serial),
                    serial,
                    false,
                    false,
                )
                .await
            {
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
        let core_res =
            mirin_core::screenshot::capture_fallback(adb_path, serial, elements, annotate).await?;

        Ok(ScreenshotResult {
            data_base64: core_res.data_base64,
            mime_type: core_res.mime_type,
            width: core_res.width,
            height: core_res.height,
            annotated_elements: core_res.annotated_elements,
        })
    }

    pub async fn complete_request(
        &self,
        req_id: String,
        result: ScreenshotResult,
    ) -> Result<(), String> {
        let mut pending = self.pending_requests.lock().await;
        if let Some(tx) = pending.remove(&req_id) {
            let _ = tx.send(result);
            Ok(())
        } else {
            Err(format!(
                "Screenshot request {} not found or timed out",
                req_id
            ))
        }
    }
}
