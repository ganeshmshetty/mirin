# Mirin Product Roadmap & 2-Month MVP Plan

This roadmap outlines the development plan to make **Mirin** the ultimate **Android Screen Mirroring & Control Workspace** on macOS and Windows. 

The plan focuses strictly on high-performance screen mirroring, remote control utilities, and **Model Context Protocol (MCP) integrations** for AI agents.

---

## 📅 Phase 1 (Weeks 1-2): Advanced Mirror Profiles & Settings
*Goal: Provide deep customization over screen mirroring behavior, allowing users to optimize stream quality and device states.*

*   **Rust Backend Tasks:**
    *   Expose advanced scrcpy CLI flags to the Tauri settings commands (e.g., `--show-touches`, `--stay-awake`, `--power-off-on-close`).
    *   Support custom window size options and initial positioning config.
*   **React Frontend Tasks:**
    *   Add controls in the **Quality & Performance** panel for toggling touches, lock screen rotation, and automatic device power-off behavior.
    *   Create mirroring **Presets / Profiles** (e.g., "Gaming" for 60fps/High Bitrate, "Low Latency" for reduced resolution, and "Battery Saver").

---

## 📅 Phase 2 (Weeks 3-4): Audio Forwarding & Quick Keyboard Controls
*Goal: Enable full multimedia casting and convenient desktop shortcuts to navigate the phone.*

*   **Audio Forwarding:**
    *   Configure `scrcpy` native audio forwarding (Android 11+) to capture and play phone audio (calls, apps, games) directly through Mac/PC speakers or headphones.
*   **Virtual Input & Shortcuts:**
    *   Build a quick-action overlay panel in the mirroring window to trigger hardware keys (Home, Back, App Switcher, Volume Up/Down, Power).
    *   Implement computer-to-device keyboard hotkeys (e.g., `Cmd+H`/`Ctrl+H` for Home, `Cmd+B`/`Ctrl+B` for Back).

---

## 📅 Phase 3 (Weeks 5-6): Session Recording & Screenshot Utilities
*Goal: Provide built-in tools to capture, document, and record screen sharing sessions.*

*   **Capture Utilities:**
    *   Add a "Screenshot" button to capture the current frame buffer and save it directly to the computer's Downloads folder.
    *   Add a "Record Session" button to record mirroring to a local `.mp4` file or compress it into an animated `.gif` (crucial for sharing bugs or app flows).
*   **Performance Monitoring:**
    *   Display a real-time floating overlay showing stream statistics (Current FPS, encoding bitrate, packet latency, and resolution).

---

## 📅 Phase 4 (Weeks 7-8): MCP Server Integration & Public Release
*Goal: Expose screen mirroring and device control capabilities to AI agents (like Cursor, Claude Desktop, and Gemini) and launch the release.*

*   **MCP Server Implementation:**
    *   Implement a headless CLI execution flag (`--mcp`) in the Tauri Rust backend to launch the Stdin/Stdout JSON-RPC 2.0 protocol.
    *   Expose mirroring-specific MCP Tools to AI agents:
        *   `list_devices` — Returns connected devices with connection status and brand/model names.
        *   `start_mirroring` — Spawns the physical mirroring window for a device.
        *   `stop_mirroring` — Force closes the mirroring session.
        *   `take_screenshot` — Captures the current frame buffer and returns a Base64-encoded PNG so the AI can "see" the phone state.
        *   `send_input` — Injects taps, swipes, and text entries directly to control the phone remotely.
*   **Packaging & Deployment:**
    *   Conduct stability testing on the self-healing ADB backend.
    *   Release **Mirin v0.2.0** on GitHub and push the updated Cask definition to your Homebrew Tap.
