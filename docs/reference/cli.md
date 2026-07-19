# CLI reference

Run the workspace CLI with `cargo run -p mirin-cli -- --help`.

## Commands

| Command | Purpose |
| --- | --- |
| `devices` | Prints resolved connected Android devices as JSON. |
| `mcp` | Starts the reusable MCP server. |

`mcp` defaults to stdio. Use `--transport http` to enable HTTP and
`--listen 127.0.0.1:7270` to choose its address (the same address is the
default). The CLI locates bundled resources through `MIRIN_RESOURCES_DIR`, the
development resources directory, or `./resources`.

```sh
cargo run -p mirin-cli -- devices
cargo run -p mirin-cli -- mcp --transport http --listen 127.0.0.1:7270
```
