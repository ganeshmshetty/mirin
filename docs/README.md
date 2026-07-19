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

Begin with the user onboarding path above, then read the [CLI reference](reference/cli.md)
and [MCP guide](reference/mcp.md). Treat device availability and authorization
as runtime state: an integration should not assume that a saved device is
connected or authorized.

### Contributors

Use the same onboarding path to verify a local app build against a real
Android device. Continue with [development setup](development/setup.md),
[architecture](explanation/architecture.md), and
[contributing](development/contributing.md).

## Available guides

- [Installation](getting-started/installation.md)
- [First USB mirror](getting-started/first-mirror.md)
- [Troubleshooting](guides/troubleshooting.md)
- [Wireless pairing](guides/wireless-pairing.md)
- [Device management](guides/device-management.md)
- [Mirroring](guides/mirroring.md)
- [Files and apps](guides/files-and-apps.md)
- [Settings reference](reference/settings.md)
- [CLI reference](reference/cli.md)
- [MCP guide](reference/mcp.md)
- [MCP tool reference](reference/mcp-tools.md)
- [MCP resource reference](reference/mcp-resources.md)
- [Architecture](explanation/architecture.md)
- [Development setup](development/setup.md)
- [Contributing](development/contributing.md)
