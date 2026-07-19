use crate::adb::Adb;
use anyhow::Result;
use quick_xml::events::Event;
use quick_xml::Reader;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use tokio::sync::Mutex as TokioMutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiElement {
    pub id: u32,
    /// Snapshot-bound target handle. Numeric IDs are only retained for display
    /// and legacy callers; automation should use this handle instead.
    pub handle: String,
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
    pub snapshot_id: String,
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
    handles: Arc<TokioMutex<HashMap<String, (String, UiElement)>>>,
}

impl UiExtractor {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(TokioMutex::new(HashMap::new())),
            handles: Arc::new(TokioMutex::new(HashMap::new())),
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
                                        handle: String::new(),
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

        let mut elements = Self::parse_xml(&xml_output)?;

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

        static SNAPSHOT_COUNTER: AtomicU64 = AtomicU64::new(1);
        static TARGET_COUNTER: AtomicU64 = AtomicU64::new(1);
        let snapshot_id = format!(
            "s{}-{}",
            now,
            SNAPSHOT_COUNTER.fetch_add(1, Ordering::Relaxed)
        );
        for element in &mut elements {
            element.handle = format!(
                "mirin-target-{}",
                TARGET_COUNTER.fetch_add(1, Ordering::Relaxed)
            );
        }

        let result = UiTreeResult {
            snapshot_id,
            timestamp: now,
            screen_width: max_w,
            screen_height: max_h,
            elements,
            raw_xml: Some(xml_output),
        };

        let mut cache_lock = self.cache.lock().await;
        cache_lock.insert(serial.to_string(), result.clone());

        let mut handles = self.handles.lock().await;
        for element in &result.elements {
            handles.insert(
                element.handle.clone(),
                (serial.to_string(), element.clone()),
            );
        }
        if handles.len() > 2048 {
            handles.retain(|_, (handle_serial, _)| handle_serial == serial);
        }

        let mut ret = result;
        if !raw {
            ret.raw_xml = None;
        }
        Ok(ret)
    }

    pub async fn get_device_size(&self, adb: &Adb, serial: &str) -> Result<(u32, u32), String> {
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
        let tree = self.get_tree(adb, serial, false, true).await?;
        let sel = selector.trim();

        if sel.is_empty() {
            return Err("Selector must not be empty".to_string());
        }

        // 1. Resolve a snapshot-bound handle. Handles are validated against
        // the current tree before coordinates are returned.
        if sel.starts_with("mirin:") {
            return self.resolve_handle(adb, serial, sel).await;
        }

        // 2. Try numeric ID (supports both "18" and "[18]" formats). This is
        // retained for compatibility but is resolved only against this fresh
        // snapshot and should not be treated as a stable target identity.
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

        let center = |el: &UiElement| {
            (
                (el.bounds.0 + el.bounds.2) / 2,
                (el.bounds.1 + el.bounds.3) / 2,
                el.clone(),
            )
        };

        // 3. Prefer exact matches so a selector such as "Settings" does not
        // unexpectedly resolve to "Settings and privacy" first.
        let sel_lower = sel.to_lowercase();
        for el in &tree.elements {
            let exact = el.text.as_deref().map(str::to_lowercase).as_deref() == Some(&sel_lower)
                || el.content_desc.as_deref().map(str::to_lowercase).as_deref() == Some(&sel_lower)
                || el.resource_id.as_deref().map(str::to_lowercase).as_deref() == Some(&sel_lower);
            if exact {
                return Ok(center(el));
            }
        }

        // 4. Fall back to case-insensitive substring matching.
        for el in &tree.elements {
            let matches = el
                .text
                .as_deref()
                .is_some_and(|t| t.to_lowercase().contains(&sel_lower))
                || el
                    .content_desc
                    .as_deref()
                    .is_some_and(|d| d.to_lowercase().contains(&sel_lower))
                || el
                    .resource_id
                    .as_deref()
                    .is_some_and(|id| id.to_lowercase().contains(&sel_lower));
            if matches {
                return Ok(center(el));
            }
        }

        Err(format!(
            "Element matching selector '{}' not found on screen",
            selector
        ))
    }

    async fn resolve_handle(
        &self,
        adb: &Adb,
        serial: &str,
        handle: &str,
    ) -> Result<(i32, i32, UiElement), String> {
        let (handle_serial, original) = {
            let handles = self.handles.lock().await;
            handles.get(handle).cloned().ok_or_else(|| {
                format!(
                    "Unknown or expired UI target handle '{}'. Call get_screen again.",
                    handle
                )
            })?
        };
        if handle_serial != serial {
            return Err("UI target handle belongs to a different device".to_string());
        }

        let tree = self.get_tree(adb, serial, false, true).await?;
        let same_identity = |candidate: &&UiElement| {
            candidate.class == original.class
                && candidate.text == original.text
                && candidate.content_desc == original.content_desc
                && candidate.resource_id == original.resource_id
        };

        let mut candidates: Vec<UiElement> = tree
            .elements
            .iter()
            .filter(same_identity)
            .cloned()
            .collect();

        if let Some(exact_id) = candidates.iter().find(|element| element.id == original.id) {
            candidates = vec![exact_id.clone()];
        }

        if candidates.len() != 1 {
            return Err(if candidates.is_empty() {
                format!(
                    "UI target '{}' is stale or no longer visible. Call get_screen again.",
                    handle
                )
            } else {
                format!(
                    "UI target '{}' is ambiguous after the screen changed; call get_screen again.",
                    handle
                )
            });
        }

        let element = candidates.remove(0);
        let center_x = (element.bounds.0 + element.bounds.2) / 2;
        let center_y = (element.bounds.1 + element.bounds.3) / 2;
        Ok((center_x, center_y, element))
    }

    /// Resolve a semantic selector to the best node to tap. If the matched
    /// node is not clickable, choose the smallest clickable node whose bounds
    /// contain it (the usual Android text-view inside clickable-row shape).
    pub async fn resolve_click_target(
        &self,
        adb: &Adb,
        serial: &str,
        selector: &str,
    ) -> Result<(i32, i32, UiElement), String> {
        let trimmed = selector.trim();
        let is_handle = trimmed.starts_with("mirin:");
        let is_numeric = trimmed
            .strip_prefix('[')
            .and_then(|value| value.strip_suffix(']'))
            .unwrap_or(trimmed)
            .parse::<u32>()
            .is_ok();
        if !is_handle && !is_numeric {
            let tree = self.get_tree(adb, serial, false, true).await?;
            let needle = trimmed.to_lowercase();
            let exact_matches: Vec<&UiElement> = tree
                .elements
                .iter()
                .filter(|element| {
                    element
                        .text
                        .as_deref()
                        .is_some_and(|value| value.eq_ignore_ascii_case(&needle))
                        || element
                            .content_desc
                            .as_deref()
                            .is_some_and(|value| value.eq_ignore_ascii_case(&needle))
                        || element
                            .resource_id
                            .as_deref()
                            .is_some_and(|value| value.eq_ignore_ascii_case(&needle))
                })
                .collect();
            let mut clickable_ids = Vec::new();
            for matched in exact_matches {
                let (x1, y1, x2, y2) = matched.bounds;
                let target = tree
                    .elements
                    .iter()
                    .filter(|candidate| {
                        candidate.clickable
                            && candidate.bounds.0 <= x1
                            && candidate.bounds.1 <= y1
                            && candidate.bounds.2 >= x2
                            && candidate.bounds.3 >= y2
                    })
                    .min_by_key(|candidate| {
                        let (cx1, cy1, cx2, cy2) = candidate.bounds;
                        (cx2 - cx1).max(0) as i64 * (cy2 - cy1).max(0) as i64
                    })
                    .unwrap_or(matched);
                if !clickable_ids.contains(&target.id) {
                    clickable_ids.push(target.id);
                }
            }
            if clickable_ids.len() > 1 {
                return Err(format!(
                    "Selector '{}' matches multiple clickable elements; use the element handle from get_screen",
                    selector
                ));
            }
        }

        let (matched_x, matched_y, matched) = self.resolve_selector(adb, serial, selector).await?;
        if matched.clickable {
            return Ok((matched_x, matched_y, matched));
        }

        let tree = self.get_tree(adb, serial, false, true).await?;
        let (x1, y1, x2, y2) = matched.bounds;
        let targets: Vec<UiElement> = tree
            .elements
            .iter()
            .filter(|candidate| {
                candidate.clickable
                    && candidate.bounds.0 <= x1
                    && candidate.bounds.1 <= y1
                    && candidate.bounds.2 >= x2
                    && candidate.bounds.3 >= y2
            })
            .cloned()
            .collect();

        let target = targets.iter().min_by_key(|candidate| {
            let (cx1, cy1, cx2, cy2) = candidate.bounds;
            (cx2 - cx1).max(0) as i64 * (cy2 - cy1).max(0) as i64
        });

        if let Some(target) = target {
            let (tx1, ty1, tx2, ty2) = target.bounds;
            let smallest_area = (tx2 - tx1).max(0) as i64 * (ty2 - ty1).max(0) as i64;
            let equally_small = targets
                .iter()
                .filter(|candidate| {
                    let (cx1, cy1, cx2, cy2) = candidate.bounds;
                    (cx2 - cx1).max(0) as i64 * (cy2 - cy1).max(0) as i64 == smallest_area
                })
                .count();
            if equally_small > 1 {
                return Err(format!(
                    "Selector '{}' matches multiple clickable elements; use the element handle from get_screen",
                    selector
                ));
            }
            return Ok(((tx1 + tx2) / 2, (ty1 + ty2) / 2, target.clone()));
        }

        Ok((matched_x, matched_y, matched))
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
