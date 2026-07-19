# Contributing

Keep commits focused. Put UI behavior in `src/`, Tauri adapters in
`src-tauri/src/commands/`, and reusable native behavior in `mirin-core`. Run
`npm run check` plus relevant Cargo tests before submitting.

`docs/` is canonical. Update it whenever user workflows, settings, CLI options,
MCP schemas, platforms, or safety behavior change. Clearly flag device actions
that can delete data, alter permissions, or disclose clipboard/log content.
