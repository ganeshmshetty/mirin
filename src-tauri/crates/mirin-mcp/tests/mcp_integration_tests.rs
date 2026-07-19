use mirin_mcp::tools::ScriptStep;

#[test]
fn script_step_uses_the_unified_tap_target() {
    let step = ScriptStep {
        action: "tap".to_string(),
        target: Some(serde_json::json!({ "selector": "1" })),
        selector: None,
        coordinate_mode: None,
        x: None,
        y: None,
        end_x: None,
        end_y: None,
        text: None,
        keycode: None,
        duration_ms: None,
    };

    let value = serde_json::to_value(step).expect("script step should serialize");
    assert_eq!(value["action"], "tap");
    assert_eq!(value["target"]["selector"], "1");
}
