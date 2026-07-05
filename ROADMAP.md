# Mirin Product Roadmap

Based on market research of user pain points (bloated IDEs, paid file managers, and complex setup) and target personas (Developers, QA Testers, and Power Users), this roadmap outlines the development plan for **Mirin** to become the ultimate Android Workspace and Control Center.

---

## 📅 Stage 1: Core Workspace & Diagnostics (Current Phase)
*Goal: Provide a lightweight, free, high-performance desktop workspace that matches scrcpy's speed and provides essential developer/management utilities.*

### Core Mirroring & UI
- [x] **Low-latency USB Mirroring:** Powered by scrcpy backend integration.
- [x] **Premium UI/UX:** Grayish dark mode theme, iOS-style toggle switches, tooltips, and custom dropdown selectors.
- [x] **Silent Auto-saving:** Instant background persistence for all configuration options.
- [x] **Self-healing ADB:** Backend automatic `kill-server`/`start-server` resets on connection freezes.

### Next Features in Queue (Stage 1.5)
- [ ] **Drag-and-Drop APK Installer:** Drag any `.apk` file from the desktop and drop it onto the device card to install it instantly.
- [ ] **Android File Explorer:** A dedicated sidebar tab displaying the phone's storage tree (Browse folders, delete, and copy files bidirectional).
- [ ] **Interactive Logcat Console:** A real-time, color-coded, searchable log stream for debugging apps without Android Studio.
- [ ] **Screenshot & Screen Recording GUI:** Action buttons next to the device to quickly capture screenshot images or record video sessions to `.mp4`/`.gif`.

---

## 📶 Stage 2: Wireless & Productivity Sync
*Goal: Remove physical cables, enable cross-device productivity shortcuts, and mirror system notifications/audio.*

- [x] **Wireless Auto-discovery:** mDNS network discovery and secure 6-digit pin pairing (Android 11+).
- [ ] **Shared Clipboard:** Automatic copy-paste synchronization between macOS/Windows and Android.
- [ ] **Audio Casting:** Direct phone audio forwarding to Mac/PC speakers.
- [ ] **Notification Center:** Desktop notifications forwarding with quick-reply functionality.
- [ ] **Multi-device Window Management:** Launching and managing multiple concurrent mirror windows side-by-side (critical for QA testers).

---

## 🤖 Stage 3: Agentic Automation & Developer Utilities
*Goal: Enable advanced developer workflows and allow AI agents to interact with devices.*

- [ ] **MCP (Model Context Protocol) Server:** Standalone headless CLI flag (`--mcp`) allowing AI tools (like Cursor, Claude Desktop, and Gemini) to list devices, run commands, and take screenshots.
- [ ] **Macro Input Recorder:** Record tap/swipe sequences on the mirrored screen and save them as reusable automation scripts.
- [ ] **Performance Monitor:** Real-time graphs displaying device battery temperature, CPU core usage, and memory consumption.
- [ ] **Sensor Emulation:** Simulate changes in mock GPS location, accelerometer, and network conditions directly from the computer dashboard.
