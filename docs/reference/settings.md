# Settings reference

Mirin stores settings locally and normalizes invalid persisted values when it
loads them.

| Setting | Default | Valid values / behavior |
| --- | --- | --- |
| Resolution | `default` | Non-empty string. `default` preserves scrcpy's default; UI presets use `800` or `1280`. |
| Bitrate | `8000000` | Bits per second. Values from 1 through 100,000,000 are retained; invalid values reset to default. |
| Maximum FPS | `60` | Values from 1 through 120 are retained; invalid values reset to 60. |
| Always on top | `false` | Keeps the Mirin window above other windows when enabled. |
| Stay awake | `true` | Passed to the mirror session to request that the device stay awake. |
| Turn screen off | `false` | Passed to the mirror session to request the Android display turn off while mirroring. |
| Theme | `system` | `light`, `dark`, or `system`; other values reset to `system`. |
| Language | `en` | `en`, `es`, or `zh`; other values reset to `en`. |
| MCP enabled | `true` | Persisted preference for MCP configuration. The current desktop server is started by the app runtime. |
| MCP port | `48484` | Non-zero unsigned port is retained in settings. The current embedded MCP HTTP listener is defined separately as `127.0.0.1:7270`; do not assume this preference rebinds it. |
| MCP require auth | `true` | Persisted MCP preference. Check the active server implementation before relying on it as an access-control boundary. |
| MCP log level | `info` | `error`, `info`, or `debug`; other values reset to `info`. |

The UI also provides performance presets: performance (`800`, 4 Mbps, 30 FPS),
balanced (`1280`, 8 Mbps, 60 FPS), and high quality (`default`, 16 Mbps, 60
FPS). Saving occurs as settings change.
