# Mirin

A modern, intuitive graphical interface for [scrcpy](https://github.com/Genymobile/scrcpy) - the powerful Android screen mirroring tool.

## Features

- **Device Management** - Automatic USB device detection and smart device history.
- **Wireless Setup (Android 11+)** - Seamless wireless pairing with pairing codes and mDNS network auto-discovery.
- **Mirror Control** - One-click screen mirroring with customizable settings.
- **Advanced Settings** - Persistent configuration for resolution, bitrate, FPS, and display options.
- **Session Management** - Track and control multiple active mirroring sessions.
- **Modern UI** - Clean, responsive interface built with React and Tailwind CSS. Features a beautifully unified connection flow.

## Requirements

- macOS / Windows
- Android device (5.0+) with USB debugging enabled
- For Wireless Pairing: Android 11+

## Installation

1. Download the latest installer from the [Releases](https://github.com/ganeshmshetty/mirin/releases) page.
2. Run the installer and follow the on-screen instructions.
3. Launch **Mirin** from your applications folder.

## Changelog

### v0.1.1
- **Feature**: Full support for Android 11+ Wireless Pairing (via 6-digit code).
- **Feature**: Added mDNS auto-discovery for wireless devices to eliminate manual IP entry.
- **Enhancement**: Entirely redesigned "Connect Device" modal featuring a clean, unified entry screen and interactive scanning UI.
- **Fix**: Surfaced background ADB errors into the UI to prevent silent hangs.
- **Refactor**: Improved history logic (devices are now explicitly saved rather than silently auto-queued).

## Development

### Prerequisites

- [Rust](https://www.rust-lang.org/tools/install)
- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/ganeshmshetty/mirin.git
   cd mirin
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Run in development mode:
   ```bash
   npm run tauri dev
   ```

## Technology Stack

- **Frontend**: React, TypeScript, Tailwind CSS, Vite
- **Backend**: Rust, Tauri
- **Core**: Scrcpy, ADB

## Acknowledgments

- Powered by [scrcpy](https://github.com/Genymobile/scrcpy) by Genymobile
- Built with [Tauri](https://tauri.app/)
