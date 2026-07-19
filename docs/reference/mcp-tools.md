# MCP tools reference

`serial` is optional after a device has been connected in the same server
instance. Fields not listed as required are optional.

| Tool | Required fields | Purpose |
| --- | --- | --- |
| `list_devices` | — | List USB and wireless devices. |
| `connect_device` | — | Start/reuse a session; accepts `serial`, `popup`. |
| `disconnect_device` | — | Stop session and clean up tunnels. |
| `get_screen` | — | UI tree; accepts `serial`, `raw`. |
| `get_screenshot` | — | Screenshot; accepts `serial`, `annotate`. |
| `find_element` | `selector` | Find UI by selector. |
| `tap` | `target` | Tap handle, selector, or coordinates. |
| `long_press` | — | Selector/coordinates; accepts duration and coordinate mode. |
| `swipe`, `drag` | — | Start/end coordinates or selector; accepts duration and coordinate mode. |
| `scroll_to` | `selector` | Scroll to selector; accepts direction and max swipes. |
| `type_text` | `text` | Type into focused field. |
| `press_key` | `keycode` | Send Android keycode. |
| `clipboard` | `action` | Get/set clipboard; accepts text. |
| `set_orientation` | `orientation` | `portrait` or `landscape`. |
| `list_apps` | — | Lists packages; accepts `third_party_only`. |
| `launch_app`, `stop_app` | `package` | Start or force-stop package. |
| `grant_permission`, `revoke_permission` | `package`, `permission` | Change runtime permission. |
| `get_logcat` | — | Recent logs; accepts lines/package/tag filters. |
| `run_script` | `steps` | Runs up to 50 sequential action steps. |

Coordinates use `absolute` pixels or `normalized` fractions. Prefer a handle
from `get_screen` over guessed coordinates. `run_script` aborts on its first
failed step.
