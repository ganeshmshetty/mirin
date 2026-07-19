# Mirin documentation

`docs/` is the canonical documentation source for Mirin. Start here when the
application, a release note, or another source disagrees with older guidance.

## Choose a path

### Users

1. [Install Mirin](getting-started/installation.md) on macOS or Windows and
   prepare an Android device.
2. [Mirror your first device](getting-started/first-mirror.md) over USB.
3. Use [troubleshooting](guides/troubleshooting.md) when discovery, pairing,
   bundled resources, or a mirror session does not work.

### AI-tool integrators

Begin with the user onboarding path above. It establishes the device
connection and mirror session that an integration works with. Treat device
availability and authorization as runtime state: an integration should not
assume that a saved device is connected or authorized.

### Contributors

Use the same onboarding path to verify a local app build against a real
Android device. The implementation uses React/TypeScript with Tauri/Rust, and
bundles ADB and scrcpy resources for supported platforms; see
[installation](getting-started/installation.md#development-setup) for local
development prerequisites.

## Available guides

- [Installation](getting-started/installation.md)
- [First USB mirror](getting-started/first-mirror.md)
- [Troubleshooting](guides/troubleshooting.md)
