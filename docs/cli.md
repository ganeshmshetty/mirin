# Command-line interface reference

Gemini CLI provides a command-line interface named `mirin-cli` to interact
with Android devices and run integration services. This reference details the
commands and options available for configuring the system.

You can run the CLI binary using Cargo from the workspace root or build the
production binary for your platform.

## Subcommands

The binary exposes specific subcommands to list devices or start the
communication server.

- `devices` prints all detected Android devices as a JSON array.
- `mcp` starts the Model Context Protocol (MCP) server to interface with AI
  agents.

### Devices command

The `devices` command queries the Android Debug Bridge (ADB) to retrieve all
connected devices. It returns a formatted JSON array containing the serial
numbers, connection types, and authorization status.

To list the connected devices, run the following command:

```bash
cargo run --bin mirin-cli devices
```

The command outputs a JSON list of devices, as shown in this example:

```json
[
  {
    "serial": "1234567890ABCDEF",
    "name": "Pixel 6",
    "connection_type": "usb",
    "authorized": true
  }
]
```

### Mcp command

The `mcp` command starts the Model Context Protocol (MCP) server, which lets
AI agents interact with connected Android devices. The server can communicate
over standard input and output channels or a local network socket.

To run the MCP server with the default configuration, execute this command:

```bash
cargo run --bin mirin-cli mcp
```

You can customize the server execution using these options:

- `--transport`: Specifies the communication channel. You must choose either
  `stdio` or `http`. The default value is `stdio`.
- `--listen`: Specifies the network address and port when using the `http`
  transport. The default value is `127.0.0.1:7270`.

## Next steps

You can configure your local development environment or integrate the server
with your favorite AI tool.

- Read the [model context protocol guide](mcp.md) to learn how to connect the
  server to AI clients.
- Check the [architecture details](architecture.md) to understand how the CLI
  interacts with the Rust backend.
