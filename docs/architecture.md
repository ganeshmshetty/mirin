# Codebase architecture

Gemini CLI utilizes a modern, distributed architecture combining a desktop
host, command-line interface, and Model Context Protocol (MCP) server. This
document describes the codebase architecture, the module organization, and the
communication patterns between the components.

Understanding this structure lets you navigate the codebase and add features
efficiently.

## Modular design

We partition the codebase into distinct packages to isolate frontend and
backend concerns, which makes the components reusable across different runtime
environments.

The repository layout includes the following modules:

- `src/` contains the React-based frontend application.
- `src-tauri/` contains the Rust desktop backend launcher.
- `src-tauri/crates/mirin-core/` contains the core backend services, including
  ADB commands, scrcpy process lifecycle, and file transfer parsers.
- `src-tauri/crates/mirin-mcp/` contains the Model Context Protocol server.
- `src-tauri/crates/mirin-cli/` contains the standalone CLI entry point.

## Frontend communication and service layer

The React frontend communicates with the Tauri backend via Inter-Process
Communication (IPC). To maintain clean code boundaries, you must use the
service layer to trigger backend operations rather than invoking Tauri commands
directly from components.

The service layer is structured as follows:

- React components import wrappers from `src/services/` to initiate actions.
- The service wrappers execute the Tauri `invoke` function under the hood.
- The TS file `src/types/tauri-commands.ts` defines the types for data sent or
  received over IPC. You must keep these types in sync with the Rust structs
  to prevent runtime deserialization failures.

## Backend modules

The Rust backend implements the system logic in a set of specialized modules
under the `mirin-core` crate.

The core modules are:

- `mirin_core::adb` wraps the Android Debug Bridge, providing device detection,
  wireless pairing, and status checks.
- `mirin_core::scrcpy` manages the scrcpy server process lifecycle, handles
  video decoding configuration, and processes screen control commands.
- `mirin_core::ui_extractor` parses the UI layout tree from connected devices
  to locate components by their properties.
- `mirin_core::settings` manages the persistent JSON settings, implementing
  strict bounds checking and sanitization.

## Next steps

You can read other guides to learn how to interact with the system or begin
developing new features.

- Read the [command-line reference](cli.md) to inspect the CLI capabilities.
- Read [contributing guidelines](../CONTRIBUTING.md) to start coding.
