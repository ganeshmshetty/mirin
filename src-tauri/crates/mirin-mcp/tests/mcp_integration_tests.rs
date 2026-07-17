use mirin_mcp::tools::ScriptStep;

#[test]
fn script_step_keeps_the_legacy_wire_shape() {
    let step = ScriptStep {
        action: "tap".to_string(),
        selector: Some("1".to_string()),
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
    assert_eq!(value["selector"], "1");
}
