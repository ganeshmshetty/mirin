# MCP guide

Mirin MCP controls real Android devices. Trust the configured client and seek
approval before operations that change device state.

The desktop app currently exposes streamable HTTP on
`http://127.0.0.1:7270/mcp`. The CLI defaults to stdio and can expose HTTP;
see [CLI](cli.md). Persisted MCP preferences do not currently prove that the
listener address, authentication, or enablement has changed.

Call `list_devices` to inspect ADB availability, then `connect_device` before
tools that need a scrcpy control session. See [tools](mcp-tools.md) and
[resources](mcp-resources.md).
