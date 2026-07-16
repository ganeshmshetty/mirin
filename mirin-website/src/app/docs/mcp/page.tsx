"use client";
import React, { useState } from "react";
import { Check, Copy, Cpu, Smartphone, MousePointer2, Keyboard, Type, AppWindow, Terminal } from "lucide-react";

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
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">MCP Server</h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Mirin includes a native Model Context Protocol (MCP) server on <code className="text-accent bg-accent-soft px-1.5 py-0.5 rounded text-sm">127.0.0.1:48484</code>. AI assistants like Claude Desktop and Cursor can connect and control your Android device directly.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">Configuration</h2>

        <div className="space-y-3">
          <h3 className="text-lg font-medium text-text-primary">Claude Desktop</h3>
          <p className="text-sm text-text-muted">
            Add to <code className="text-xs bg-page-bg px-1 rounded">claude_desktop_config.json</code> (<code className="text-xs bg-page-bg px-1 rounded">~/Library/Application Support/Claude/</code> on macOS):
          </p>
          <div className="relative">
            <pre className="bg-[#0f1115] border border-border rounded-lg p-4 text-xs font-mono text-[#e2e8f0] overflow-x-auto">
{`{
  "mcpServers": {
    "mirin": {
      "command": "mirin",
      "args": ["--mcp"]
    }
  }
}`}
            </pre>
            <button onClick={() => handleCopy(`{\n  "mcpServers": {\n    "mirin": {\n      "command": "mirin",\n      "args": ["--mcp"]\n    }\n  }\n}`, "mcp-json")} className="p-1.5 hover:bg-app-card rounded text-app-text-muted hover:text-app-text transition-colors absolute top-2 right-2 border border-app-border">
              {copiedText === "mcp-json" ? <Check size={14} className="text-app-primary" /> : <Copy size={14} />}
            </button>
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-lg font-medium text-text-primary">Cursor / Windsurf</h3>
          <p className="text-sm text-text-muted">
            Use the same JSON in your IDE's MCP configuration. Mirin exposes tools globally, so any MCP-compatible client can use them.
          </p>
        </div>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">Available Tools</h2>
        <p className="text-sm text-text-muted">Once connected, MCP clients can call these tools on your device:</p>

        <div className="space-y-3">
          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">list_devices</code>
            </div>
            <p className="text-xs text-text-muted">Returns all connected devices with serial, status, model, and connection type.</p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Cpu size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">get_screenshot</code>
            </div>
            <p className="text-xs text-text-muted">Captures the current screen as base64 PNG. Supports <code className="text-xs bg-page-bg px-1 rounded">annotate: true</code> for Set-of-Mark numbered bounding boxes.</p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <MousePointer2 size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">tap, long_press, swipe, drag</code>
            </div>
            <p className="text-xs text-text-muted">Touch actions via coordinates, accessibility selectors (<code className="text-xs bg-page-bg px-1 rounded">"Allow"</code>), or Set-of-Mark IDs (<code className="text-xs bg-page-bg px-1 rounded">"4"</code>).</p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Keyboard size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">press_key</code>
            </div>
            <p className="text-xs text-text-muted">Send Android keycodes: <code className="text-xs bg-page-bg px-1 rounded">HOME</code> (3), <code className="text-xs bg-page-bg px-1 rounded">BACK</code> (4), <code className="text-xs bg-page-bg px-1 rounded">ENTER</code> (66), etc.</p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Type size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">type_text</code>
            </div>
            <p className="text-xs text-text-muted">Inject UTF-8 text directly into the focused input field.</p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <AppWindow size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">launch_app, stop_app, list_apps</code>
            </div>
            <p className="text-xs text-text-muted">Manage applications via package name using Activity resolution.</p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Terminal size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">get_logcat</code>
            </div>
            <p className="text-xs text-text-muted">Fetch recent logcat output, optionally filtered by package or tag.</p>
          </div>

          <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <Smartphone size={16} className="text-accent" />
              <code className="font-mono text-sm font-semibold text-accent">find_element, get_current_activity</code>
            </div>
            <p className="text-xs text-text-muted">Query UI hierarchy and the top resumed activity for navigation context.</p>
          </div>
        </div>
      </section>
    </>
  );
}
