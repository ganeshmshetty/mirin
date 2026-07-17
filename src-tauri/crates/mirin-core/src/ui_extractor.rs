use crate::adb::Adb;
use anyhow::Result;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiElement {
    pub id: u32,
    pub bounds: (i32, i32, i32, i32), // (x1, y1, x2, y2)
    pub text: Option<String>,
    pub content_desc: Option<String>,
    pub resource_id: Option<String>,
    pub class: String,
    pub clickable: bool,
    pub scrollable: bool,
    pub enabled: bool,
    pub focused: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiTreeResult {
    pub timestamp: u64,
    pub screen_width: u32,
    pub screen_height: u32,
    pub elements: Vec<UiElement>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub raw_xml: Option<String>,
}

#[derive(Clone)]
pub struct UiExtractor {
    cache: Arc<TokioMutex<HashMap<String, UiTreeResult>>>,
}

impl UiExtractor {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(TokioMutex::new(HashMap::new())),
        }
    }

    fn parse_bounds(bounds_str: &str) -> Option<(i32, i32, i32, i32)> {
        let s = bounds_str.trim();
        if !s.starts_with('[') || !s.ends_with(']') {
            return None;
        }
        let inner = &s[1..s.len() - 1];
        let parts: Vec<&str> = inner.split("][").collect();
        if parts.len() != 2 {
            return None;
        }
        let p1: Vec<&str> = parts[0].split(',').collect();
        let p2: Vec<&str> = parts[1].split(',').collect();
        if p1.len() != 2 || p2.len() != 2 {
            return None;
        }
        let x1 = p1[0].parse().ok()?;
        let y1 = p1[1].parse().ok()?;
        let x2 = p2[0].parse().ok()?;
        let y2 = p2[1].parse().ok()?;
        Some((x1, y1, x2, y2))
    }

    fn parse_xml(xml: &str) -> Result<Vec<UiElement>, String> {
        let mut reader = Reader::from_str(xml);
        reader.config_mut().trim_text(true);

        let mut elements = Vec::new();
        let mut buf = Vec::new();

        loop {
            match reader.read_event_into(&mut buf) {
                Ok(Event::Start(ref e)) | Ok(Event::Empty(ref e)) => {
                    if e.name().as_ref() == b"node" {
                        let mut text = None;
                        let mut content_desc = None;
                        let mut resource_id = None;
                        let mut class = String::new();
                        let mut bounds = None;
                        let mut clickable = false;
                        let mut scrollable = false;
                        let mut enabled = true;
                        let mut focused = false;

                        for attr_res in e.attributes() {
                            if let Ok(attr) = attr_res {
                                let key = attr.key.as_ref();
                                let val = String::from_utf8_lossy(&attr.value).to_string();
                                match key {
                                    b"text" => {
                                        if !val.is_empty() {
                                            text = Some(val);
                                        }
                                    }
                                    b"content-desc" => {
                                        if !val.is_empty() {
                                            content_desc = Some(val);
                                        }
                                    }
                                    b"resource-id" => {
                                        if !val.is_empty() {
                                            resource_id = Some(val);
                                        }
                                    }
                                    b"class" => class = val,
                                    b"bounds" => bounds = Self::parse_bounds(&val),
                                    b"clickable" => clickable = val == "true",
                                    b"scrollable" => scrollable = val == "true",
                                    b"enabled" => enabled = val != "false",
                                    b"focused" => focused = val == "true",
                                    _ => {}
                                }
                            }
                        }

                        if let Some((x1, y1, x2, y2)) = bounds {
                            if x2 > x1 && y2 > y1 {
                                let has_content = text.is_some()
                                    || content_desc.is_some()
                                    || resource_id.is_some();
                                let is_interactive = clickable || scrollable || focused;

                                // Keep only interactive nodes or nodes with semantic text/desc/id
                                if has_content || is_interactive {
                                    let id = (elements.len() + 1) as u32;
                                    elements.push(UiElement {
                                        id,
                                        bounds: (x1, y1, x2, y2),
                                        text,
                                        content_desc,
                                        resource_id,
                                        class,
                                        clickable,
                                        scrollable,
                                        enabled,
                                        focused,
                                    });
                                }
                            }
                        }
                    }
                }
                Ok(Event::Eof) => break,
                Err(e) => {
                    return Err(format!(
                        "XML parse error at position {}: {:?}",
                        reader.buffer_position(),
                        e
                    ))
                }
                _ => {}
            }
            buf.clear();
        }

        Ok(elements)
    }

    pub async fn get_tree(
        &self,
        adb: &Adb,
        serial: &str,
        raw: bool,
        force_refresh: bool,
    ) -> Result<UiTreeResult, String> {
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64;

        if !force_refresh {
            let cache_lock = self.cache.lock().await;
            if let Some(cached) = cache_lock.get(serial) {
                // If cache is less than 1500ms old, reuse it
                if now.saturating_sub(cached.timestamp) < 1500 {
                    let mut res = cached.clone();
                    if !raw {
                        res.raw_xml = None;
                    }
                    return Ok(res);
                }
            }
        }

        // First attempt: direct exec-out stream
        let xml_output = match adb
            .execute(&["exec-out", "uiautomator", "dump", "/dev/tty"])
            .await
        {
            Ok(out) if out.contains("<?xml") || out.contains("<hierarchy") => {
                let start = out
                    .find("<?xml")
                    .or_else(|| out.find("<hierarchy"))
                    .unwrap_or(0);
                out[start..].to_string()
            }
            _ => {
                // Fallback attempt via tmp file if /dev/tty stream failed or flaked
                let _ = adb
                    .execute(&["shell", "uiautomator", "dump", "/data/local/tmp/uidump.xml"])
                    .await?;
                let content = adb
                    .execute(&["exec-out", "cat", "/data/local/tmp/uidump.xml"])
                    .await?;
                let _ = adb
                    .execute(&["shell", "rm", "/data/local/tmp/uidump.xml"])
                    .await;
                let start = content
                    .find("<?xml")
                    .or_else(|| content.find("<hierarchy"))
                    .ok_or_else(|| {
                        "Failed to extract valid XML from uiautomator dump".to_string()
                    })?;
                content[start..].to_string()
            }
        };

        let elements = Self::parse_xml(&xml_output)?;

        let size_out = adb
            .execute(&["shell", "wm", "size"])
            .await
            .unwrap_or_default();
        let mut max_w = 0;
        let mut max_h = 0;
        for line in size_out.lines() {
            if line.contains("size:") {
                let parts: Vec<&str> = line.trim().split("size:").collect();
                if parts.len() == 2 {
                    let dims: Vec<&str> = parts[1].trim().split('x').collect();
                    if dims.len() == 2 {
                        if let (Ok(w), Ok(h)) = (dims[0].parse::<u32>(), dims[1].parse::<u32>()) {
                            max_w = w;
                            max_h = h;
                        }
                    }
                }
            }
        }
        if max_w == 0 || max_h == 0 {
            for el in &elements {
                if el.bounds.2 as u32 > max_w {
                    max_w = el.bounds.2 as u32;
                }
                if el.bounds.3 as u32 > max_h {
                    max_h = el.bounds.3 as u32;
                }
            }
        }

        let result = UiTreeResult {
            timestamp: now,
            screen_width: max_w,
            screen_height: max_h,
            elements,
            raw_xml: Some(xml_output),
        };

        let mut cache_lock = self.cache.lock().await;
        cache_lock.insert(serial.to_string(), result.clone());

        let mut ret = result;
        if !raw {
            ret.raw_xml = None;
        }
        Ok(ret)
    }

    pub async fn get_device_size(
        &self,
        adb: &Adb,
        serial: &str,
    ) -> Result<(u32, u32), String> {
        let size_out = adb
            .with_device(serial)
            .execute(&["shell", "wm", "size"])
            .await
            .map_err(|e| format!("wm size failed: {}", e))?;
        for line in size_out.lines() {
            if line.contains("size:") {
                let parts: Vec<&str> = line.trim().split("size:").collect();
                if parts.len() == 2 {
                    let dims: Vec<&str> = parts[1].trim().split('x').collect();
                    if dims.len() == 2 {
                        if let (Ok(w), Ok(h)) = (dims[0].parse::<u32>(), dims[1].parse::<u32>()) {
                            if w > 0 && h > 0 {
                                return Ok((w, h));
                            }
                        }
                    }
                }
            }
        }
        Err("Could not determine device display size".to_string())
    }

    pub async fn resolve_selector(
        &self,
        adb: &Adb,
        serial: &str,
        selector: &str,
    ) -> Result<(i32, i32, UiElement), String> {
        let tree = self.get_tree(adb, serial, false, false).await?;
        let sel = selector.trim();

        // 1. Try numeric ID (supports both "18" and "[18]" formats)
        let stripped = sel
            .strip_prefix('[')
            .and_then(|s| s.strip_suffix(']'))
            .unwrap_or(sel);
        if let Ok(num_id) = stripped.parse::<u32>() {
            if let Some(el) = tree.elements.iter().find(|e| e.id == num_id) {
                let center_x = (el.bounds.0 + el.bounds.2) / 2;
                let center_y = (el.bounds.1 + el.bounds.3) / 2;
                return Ok((center_x, center_y, el.clone()));
            }
        }

        // 2. Exact or substring match against text, content-desc, resource-id
        let sel_lower = sel.to_lowercase();
        for el in &tree.elements {
            let matches_text = el
                .text
                .as_ref()
                .map(|t| t.to_lowercase().contains(&sel_lower))
                .unwrap_or(false);
            let matches_desc = el
                .content_desc
                .as_ref()
                .map(|d| d.to_lowercase().contains(&sel_lower))
                .unwrap_or(false);
            let matches_id = el
                .resource_id
                .as_ref()
                .map(|id| id.to_lowercase().contains(&sel_lower))
                .unwrap_or(false);

            if matches_text || matches_desc || matches_id {
                let center_x = (el.bounds.0 + el.bounds.2) / 2;
                let center_y = (el.bounds.1 + el.bounds.3) / 2;
                return Ok((center_x, center_y, el.clone()));
            }
        }

        Err(format!(
            "Element matching selector '{}' not found on screen",
            selector
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_bounds() {
        assert_eq!(
            UiExtractor::parse_bounds("[0,0][1080,1920]"),
            Some((0, 0, 1080, 1920))
        );
        assert_eq!(
            UiExtractor::parse_bounds("[100,200][300,400]"),
            Some((100, 200, 300, 400))
        );
        assert_eq!(UiExtractor::parse_bounds("invalid"), None);
        assert_eq!(UiExtractor::parse_bounds("[0,0]"), None);
        assert_eq!(UiExtractor::parse_bounds("[0,0] [100,100]"), None);
    }

    #[test]
    fn test_parse_xml() {
        let xml = r#"<?xml version="1.0" encoding="utf-8"?>
        <hierarchy rotation="0">
            <node index="0" text="" resource-id="" class="android.widget.FrameLayout" bounds="[0,0][1080,1920]">
                <node index="0" text="Submit" resource-id="com.example:id/btn_submit" class="android.widget.Button" bounds="[100,200][300,300]" clickable="true" enabled="true" focused="false" scrollable="false" />
                <node index="1" text="" content-desc="Profile Picture" resource-id="" class="android.widget.ImageView" bounds="[400,100][500,200]" clickable="false" enabled="true" focused="false" scrollable="false" />
                <node index="2" text="" resource-id="" class="android.view.View" bounds="[0,0][10,10]" clickable="false" enabled="true" focused="false" scrollable="false" />
            </node>
        </hierarchy>"#;

        let elements = UiExtractor::parse_xml(xml).unwrap();
        // node 2 should be filtered out because it has no text/desc/id and is not interactive (clickable/scrollable/focused).
        assert_eq!(elements.len(), 2);

        assert_eq!(elements[0].id, 1);
        assert_eq!(elements[0].text, Some("Submit".to_string()));
        assert_eq!(
            elements[0].resource_id,
            Some("com.example:id/btn_submit".to_string())
        );
        assert_eq!(elements[0].bounds, (100, 200, 300, 300));
        assert!(elements[0].clickable);

        assert_eq!(elements[1].id, 2);
        assert_eq!(
            elements[1].content_desc,
            Some("Profile Picture".to_string())
        );
        assert_eq!(elements[1].bounds, (400, 100, 500, 200));
        assert!(!elements[1].clickable);
    }
}
