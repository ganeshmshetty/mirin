"use client";
import React, { useState } from "react";
import {
  Check,
  Copy,
  Cpu,
  Smartphone,
  MousePointer2,
  Keyboard,
  Type,
  AppWindow,
  Terminal,
} from "lucide-react";

export default function McpPage() {
  const [copiedText, setCopiedText] = useState("");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(""), 2000);
  };

  return (
    <>
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">
          MCP Server
        </h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Model Context Protocol (MCP) in Gemini CLI lets AI agents connect to
          and control Android devices directly. The server can communicate over
          standard input/output or a local network socket.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">
          Configuration
        </h2>

        <div className="space-y-3">
          <h3 className="text-lg font-medium text-text-primary">
            Claude Desktop
          </h3>
          <p className="text-sm text-text-muted">
            Add the following configuration to your{" "}
            <code className="text-xs bg-page-bg px-1 rounded">
              claude_desktop_config.json
            </code>{" "}
            file (located in{" "}
            <code className="text-xs bg-page-bg px-1 rounded">
              ~/Library/Application Support/Claude/
            </code>{" "}
            on macOS):
          </p>
          <div className="relative">
            <pre className="bg-[#0f1115] border border-border rounded-lg p-4 text-xs font-mono text-[#e2e8f0] overflow-x-auto">
              {`{
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
}`}
            </pre>
            <button
              onClick={() =>
                handleCopy(
                  `{\n  "mcpServers": {\n    "mirin": {\n      "command": "cargo",\n      "args": [\n        "run",\n        "--bin",\n        "mirin-cli",\n        "--",\n        "mcp",\n        "--transport",\n        "stdio"\n      ],\n      "env": {\n        "MIRIN_RESOURCES_DIR": "/Users/ganesh/dev/mirin/resources"\n      }\n    }\n  }\n}`,
                  "mcp-json"
                )
              }
              className="p-1.5 hover:bg-app-card rounded text-app-text-muted hover:text-app-text transition-colors absolute top-2 right-2 border border-app-border"
            >
              {copiedText === "mcp-json" ? (
                <Check size={14} className="text-app-primary" />
              ) : (
                <Copy size={14} />
              )}
            </button>
          </div>
          <p className="text-xs text-text-muted mt-2">
            Make sure the directory path in the{" "}
            <code className="text-xs bg-page-bg px-1 rounded">
              MIRIN_RESOURCES_DIR
            </code>{" "}
            environment variable matches your local checkout folder.
          </p>
        </div>

        <div className="space-y-3 pt-4">
          <h3 className="text-lg font-medium text-text-primary">
            Cursor / Windsurf
          </h3>
          <p className="text-sm text-text-muted">
            You can use the same JSON in your IDE's MCP configuration settings to
            register the server. Once registered, the assistant will have full
            access to the mirroring tools.
          </p>
        </div>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">
          Available Tools
        </h2>
        <p className="text-sm text-text-muted">
          Once connected, MCP clients can call these tools to interact with your
          device:
        </p>

        <div className="space-y-3">
          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                list_devices
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Returns all connected devices with serial, status, model, and
              connection type.
            </p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                get_screenshot
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Captures the current screen as base64 PNG. Supports{" "}
              <code className="text-xs bg-page-bg px-1 rounded">
                annotate: true
              </code>{" "}
              for Set-of-Mark numbered bounding boxes.
            </p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <MousePointer2 size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                tap, long_press, swipe, drag
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Touch actions via absolute coordinates, accessibility selectors (
              <code className="text-xs bg-page-bg px-1 rounded">"Allow"</code>),
              or Set-of-Mark IDs (
              <code className="text-xs bg-page-bg px-1 rounded">"4"</code>).
            </p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Keyboard size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                press_key
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Send Android keycodes:{" "}
              <code className="text-xs bg-page-bg px-1 rounded">HOME</code> (3),{" "}
              <code className="text-xs bg-page-bg px-1 rounded">BACK</code> (4),{" "}
              <code className="text-xs bg-page-bg px-1 rounded">ENTER</code>{" "}
              (66), etc.
            </p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Type size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                type_text
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Inject UTF-8 text directly into the focused input field.
            </p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <AppWindow size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                launch_app, stop_app, list_apps
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Manage applications via package name using Activity resolution.
            </p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Terminal size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                get_logcat
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Fetch recent logcat output, optionally filtered by package or tag.
              Log buffer is capped at a hard limit of 2000 lines.
            </p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">
                find_element, get_current_activity
              </code>
            </div>
            <p className="text-xs text-text-muted">
              Query UI hierarchy and the top resumed activity for navigation
              context.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">
          Available Resources
        </h2>
        <p className="text-sm text-text-muted">
          The server provides data resources to monitor device state:
        </p>
        <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-accent" />
            <code className="font-mono text-sm font-semibold text-accent">
              mirin://devices/&lt;serial&gt;/logcat
            </code>
          </div>
          <p className="text-xs text-text-muted">
            Exposes a real-time stream of the device system logs.
          </p>
        </div>
      </section>
    </>
  );
}
