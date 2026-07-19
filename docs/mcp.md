# Model context protocol guide

Model Context Protocol (MCP) in Gemini CLI lets AI agents connect to and
control Android devices directly. This guide explains how to configure the MCP
server, details the exposed tools, and describes the available resources.

## Configuration

You must register the server with your AI client to enable the integration.
Depending on your tool, you can configure it to start the server automatically
or connect to an existing server over HTTP.

### Claude desktop configuration

To use Gemini CLI with Claude Desktop, you must add the server details to the
client configuration file. This setup launches the server automatically
whenever you start the application.

Add the following configuration to your `claude_desktop_config.json` file:

```json
{
  "mcpServers": {
    "mirin": {
      "command": "cargo",
      "args": [
        "run",
        "--bin",
        "mirin-cli",
        "--",
        "mcp",
        "--transport",
        "stdio"
      ],
      "env": {
        "MIRIN_RESOURCES_DIR": "/Users/ganesh/dev/mirin/resources"
      }
    }
  }
}
```

Make sure the directory path in the `MIRIN_RESOURCES_DIR` environment variable
matches your local checkout folder.

## Available tools

Gemini CLI exposes a rich set of tools that allow AI agents to manage devices,
interact with applications, and execute automation scripts.

### Device management tools

These tools help you discover, connect, and disconnect devices.

- `list_devices`: Returns a JSON list of all connected Android devices and
  their status.
- `connect_device`: Establishes a mirroring and control connection to a
  specific device using its serial number.
- `disconnect_device`: Closes the active session and terminates connection
  processes for the specified device.

### Screen inspection and control tools

These tools let you inspect the screen structure, capture screenshots, and
simulate user inputs.

- `get_screen`: Retrieves the current layout hierarchy XML tree.
- `get_screenshot`: Captures a PNG screenshot. Set `annotate` to `true` to draw
  numbered bounding boxes on elements.
- `find_element`: Searches the current view for an element matching text,
  description, or resource identifier.
- `tap`: Clicks on specified coordinates or a matched element.
- `long_press`: Simulates a long-press gesture on coordinates or an element.
- `swipe`: Simulates a swipe gesture from starting to ending coordinates.
- `drag`: Executes a drag-and-drop gesture.
- `scroll_to`: Scrolls the view until the target element becomes visible.
- `type_text`: Inputs a text string into the currently focused text field.
- `press_key`: Simulates pressing a hardware or system key, for example, the
  back or home button.

### App management tools

These tools allow you to query, run, and stop applications on the device.

- `list_apps`: Lists all installed packages. You can filter for third-party or
  system apps.
- `launch_app`: Starts the main activity of the specified package.
- `stop_app`: Forces the specified application to stop.
- `grant_permission`: Grants a runtime permission to an application.
- `revoke_permission`: Revokes a runtime permission from an application.

### Debugging and scripting tools

These tools assist in inspecting system logs and executing multi-step action
sequences.

- `get_logcat`: Retrieves the recent system log entries. The log buffer is
  subject to a hard limit of 2000 lines to prevent memory exhaustion.
- `clipboard`: Reads or updates the device clipboard content.
- `set_orientation`: Rotates the device display to portrait or landscape.
- `run_script`: Executes a sequence of input steps to perform complex
  automated workflows.

## Available resources

Gemini CLI provides data resources that you can read to monitor device state.

The resource `mirin://devices/<serial>/logcat` exposes the live logcat output
for a device. Reading this URI returns a text representation of the current
logcat buffer.

## Next steps

You can test running commands or view the project layout to understand how the
server works.

- Read the [command-line interface reference](cli.md) to test running the MCP
  server.
- Check the [architecture details](architecture.md) to see how the MCP module
  fits into the codebase.
