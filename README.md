<p align="center">
  <picture>
    <source media="(prefers-color-scheme: light)" srcset="brand/icon-svg/full-lockup/Light-transparent.svg">
    <source media="(prefers-color-scheme: dark)" srcset="brand/icon-svg/full-lockup/Dark-transparent.svg">
    <img alt="Mirin" src="brand/icon-svg/full-lockup/Dark-transparent.svg" width="280">
  </picture>
</p>

<p align="center">
  A modern, intuitive graphical interface for <a href="https://github.com/Genymobile/scrcpy">scrcpy</a> - the powerful Android screen mirroring tool.
</p>

## Features

- **Device Management** - Automatic USB device detection and smart device history.
- **Wireless Setup (Android 11+)** - Seamless wireless pairing with pairing codes and mDNS network auto-discovery.
- **Mirror Control** - One-click screen mirroring with customizable settings.
- **Advanced Settings** - Persistent configuration for resolution, bitrate, FPS, and display options.
- **Session Management** - Track and control multiple active mirroring sessions.(Upcoming)
- **Modern UI** - Clean, responsive interface built. Features a beautifully unified connection flow.

## Requirements

- macOS / Windows / Linux(Not yet)
- Android device (5.0+) with USB debugging enabled
- For Wireless Pairing: Android 11+

## Installation

### Method 1: Homebrew (macOS)

You can install **Mirin** via Homebrew Cask:

```bash
brew tap ganeshmshetty/tap && brew trust --cask ganeshmshetty/tap/mirin && brew install --cask ganeshmshetty/tap/mirin
```

### Method 2: Manual Download

1. Download the latest installer (`.dmg` for macOS or `.msi` for Windows) from the [Releases](https://github.com/ganeshmshetty/mirin/releases) page.
2. Run the installer and follow the on-screen instructions.
3. Launch **Mirin** from your applications folder.
   _(Note for macOS: If you see a "damaged" warning on launch due to Gatekeeper quarantine, run `xattr -cr /Applications/Mirin.app` in your terminal to clear the quarantine flag)._
   
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
