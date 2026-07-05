# Mirin Product Roadmap & 2-Month MVP Plan

This roadmap outlines the development phases to expand **Mirin** from a screen-mirroring tool into a unified **Android Workspace & Control Center** on macOS and Windows. 

The plan is structured across **four bi-weekly milestones** over a **2-month period** to reach a production-ready Minimum Viable Product (MVP).

---

## 📅 Phase 1 (Weeks 1-2): File Explorer & Bidirectional Transfer
*Goal: Bridge the gap left by buggy MTP drivers and Apple's Android File Transfer by building a native file manager.*

*   **Rust Backend Tasks:**
    *   Expose ADB shell-based file system commands: list folder contents (including metadata like size, modification date), delete files/folders, and create directories.
    *   Optimize file download (`adb pull`) and file upload (`adb push`) tasks with progress-bar percentage callbacks.
*   **React Frontend Tasks:**
    *   Build a dedicated **File Explorer** tab in the sidebar displaying a clean, folder-tree view (Finder/Explorer style).
    *   Implement **Drag-and-Drop** file actions: dragging a file from Mac/PC desktop into the browser panel uploads it to the active device directory, and vice versa.

---

## 📅 Phase 2 (Weeks 3-4): App Management & Drag-and-Drop Installation
*Goal: Provide a streamlined dashboard to manage applications without using command lines or mobile assistant clients.*

*   **Rust Backend Tasks:**
    *   Add package management commands: list installed third-party apps, fetch app details (version, permissions), force-stop package, and clear application data/cache.
    *   Support APK extraction (`adb pull` of base APKs) to allow local backups.
*   **React Frontend Tasks:**
    *   Create an **App Manager** tab displaying a paginated table of installed apps with quick-action buttons (Uninstall, Force Stop, Clear Cache, Extract APK).
    *   Implement drag-and-drop installer: dragging an `.apk` file anywhere onto a device card triggers `adb install` in the background with a visual loading loader.

---

## 📅 Phase 3 (Weeks 5-6): Diagnostics & Real-Time Logcat Viewer
*Goal: Provide a lightweight, standalone debugging console that replaces the heavy Android Studio IDE for developers and testers.*

*   **Rust Backend Tasks:**
    *   Build an async thread-safe tokio process task that runs `adb logcat` and streams the log stdout line-by-line to the React frontend using Tauri events (`app.emit`).
    *   Support filtering logs on the Rust side to save frontend rendering memory.
*   **React Frontend Tasks:**
    *   Create a **Logcat Console** tab featuring a virtualized list (to handle millions of log rows without lagging).
    *   Apply syntax highlighting to logs (e.g., green for Info, yellow for Warn, red for Error/Fatal).
    *   Add real-time keyword search and tag filtering (filter logs by app package name).

---

## 📅 Phase 4 (Weeks 7-8): Clipboard Sync, Audio Casting, and Release
*Goal: Implement cross-device productivity utilities, final polish, and automated deployment.*

*   **Clipboard & Media Sync:**
    *   Implement a background polling loop/event listener to automatically sync copy-paste clipboards between macOS/Windows and Android.
    *   Configure `scrcpy` native audio forwarding to pipe game/video audio directly to Mac/PC speakers.
*   **Polish & Packaging:**
    *   Conduct memory leak profiling and finalize self-healing connection retry loops.
    *   Finalize and verify the macOS/Windows build outputs.
    *   Launch **Mirin v0.2.0 (MVP)** on GitHub and trigger the Homebrew Tap Cask auto-updater.
