# Architecture

Mirin combines a React/TypeScript frontend with a Tauri/Rust host. `src/`
contains UI, hooks, translations, and service wrappers. Tauri commands adapt
frontend requests to reusable native logic in `mirin-core`; that crate handles
ADB, device state, scrcpy, files, apps, settings, screenshots, and UI trees.

`mirin-mcp` provides transport-neutral tools/resources, while `mirin-cli`
assembles the same core capabilities for command-line use.

```text
React services → Tauri commands → mirin-core → ADB / scrcpy / Android
                              └→ mirin-mcp / mirin-cli → MCP clients
```

Starting a mirror establishes scrcpy server/control connections through ADB,
streams frames to the UI, and routes input back to the device. Tauri command
contracts and TypeScript types must evolve together.
