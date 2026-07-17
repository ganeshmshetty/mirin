use anyhow::Result;
use mirin_core::adb::Adb;
use serde_json::{json, Value};
use tauri::AppHandle;

#[derive(Clone)]
pub struct ResourceDispatcher<R: tauri::Runtime = tauri::Wry> {
    app: AppHandle<R>,
}

impl<R: tauri::Runtime> ResourceDispatcher<R> {
    pub fn new(app: AppHandle<R>) -> Self {
        Self { app }
    }

    pub fn get_resources_list() -> Vec<Value> {
        vec![json!({
            "uri": "mirin://devices/{id}/logcat",
            "name": "Device Logcat Stream",
            "description": "Recent logcat entries for the specified Android device serial ID.",
            "mimeType": "text/plain"
        })]
    }

    pub async fn read_resource(&self, uri: &str) -> Result<Value, String> {
        if let Some(serial_part) = uri.strip_prefix("mirin://devices/") {
            if let Some(serial) = serial_part.strip_suffix("/logcat") {
                let adb = Adb::new(crate::utils::get_adb_path(&self.app)?).with_device(serial);
                let logs = adb.execute(&["shell", "logcat", "-d", "-t", "200"]).await?;
                return Ok(json!({
                    "contents": [{
                        "uri": uri,
                        "mimeType": "text/plain",
                        "text": logs
                    }]
                }));
            }
        }
        Err(format!("Unknown or malformed resource URI: {}", uri))
    }
}

impl<R: tauri::Runtime> crate::server::ResourceReader for ResourceDispatcher<R> {
    fn read_resource<'a>(
        &'a self,
        uri: &'a str,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Value, String>> + Send + 'a>>
    {
        Box::pin(async move { ResourceDispatcher::read_resource(self, uri).await })
    }
}
