# AI Context File - Mirin (Scrcpy GUI)

> **Instructions for AI**: Read this file first to understand the project architecture, tech stack, and coding conventions.

## 1. Project Overview

**Mirin** is a Windows desktop application built with Tauri that acts as a GUI wrapper for **Scrcpy**. It provides a user-friendly interface to mirror and control Android devices via USB and Wireless (TCP/IP) connections.

## 2. Technology Stack

### Frontend

- **Framework**: React 19 + TypeScript (~5.8)
- **Build Tool**: Vite 7
- **Styling**: Tailwind CSS 3.4 (Vanilla CSS for base)
- **Icons**: Lucide React
- **State Management**: React Context / Local State (so far)

### Backend (Tauri)

- **Framework**: Tauri 2.0
- **Language**: Rust (Edition 2021)
- **Key Crates**:
  - `tauri-plugin-opener`
  - `tauri-plugin-shell`
  - `tokio` (Async runtime)

## 3. Architecture & Data Flow

### Communication Pattern

The application uses the standard Tauri IPC (Inter-Process Communication) model:

1.  **Frontend**: Calls `invoke('command_name', { args })`.
2.  **Backend**: Executes `#[tauri::command]` functions in Rust.
3.  **Responses**: Returns `Result<T, E>` which maps to Promises in JS.

### Directory Structure Map

- **`src/`**: All frontend code.
  - **`services/`**: **CRITICAL**. Wrappers for Tauri invokes. Components should call these, not `invoke` directly.
    - `deviceService.ts`: ADB and Connection commands.
    - `scrcpyService.ts`: Mirroring commands.
  - **`types/tauri-commands.ts`**: TypeScript definitions that **MUST** match Rust structs.
  - **`components/`**: UI building blocks.
- **`src-tauri/`**: Rust backend.
  - **`src/lib.rs`**: Main entry point, command registration, and plugin setup.
  - **`src/commands/`**: Implementation of invokable commands.
  - **`src/adb/`**: ADB wrapper logic.
  - **`src/scrcpy/`**: Scrcpy process management logic.

## 4. Coding Conventions & AI Rules

### 1. Type Safety Bridge

- **Problem**: Rust types and TS types are manually synced.
- **Rule**: If you modify a struct in Rust (e.g., return type of a command), you **MUST** immediately update `src/types/tauri-commands.ts` to match. Do not skip this.

### 2. Service Layer Pattern

- **Rule**: Do not use `invoke` directly inside React components (`.tsx`).
- **Correct Usage**:
  - _Bad_: `invoke('get_devices')` inside `Home.tsx`.
  - _Good_: `DeviceService.getDevices()` inside `Home.tsx`, where `DeviceService` is defined in `src/services/`.

### 3. Styling

- Use **Tailwind CSS** utility classes for layout and spacing.
- Avoid inline styles unless dynamic values are needed.

### 4. Codebase Navigation

- Use **Absolute Paths** when referencing files.
- The project root is `c:\Ganesh\Projects\scrcpygui`.

## 5. Development Scripts

- `npm run dev`: Start Vite dev server and Tauri window.
- `npm run build`: Type-check and build production bundle.
- `npm run tauri`: Access direct Tauri CLI commands.
