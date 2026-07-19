"use client";
import React from "react";
import { Folder, GitBranch, Terminal } from "lucide-react";

export default function ArchitecturePage() {
  return (
    <>
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">
          Codebase Architecture
        </h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Gemini CLI utilizes a modern, distributed architecture combining a
          desktop host, command-line interface, and Model Context Protocol (MCP)
          server.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Folder size={22} className="text-accent" /> Modular Design
        </h2>
        <p className="text-text-muted leading-relaxed">
          The codebase is partitioned into distinct packages to isolate frontend
          and backend concerns, making the components reusable across different
          runtime environments.
        </p>

        <div className="space-y-3">
          <div className="p-4 bg-page-bg-alt border border-border rounded-lg">
            <h3 className="font-semibold text-text-primary font-mono text-sm">
              src/
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Contains the React-based frontend desktop dashboard and active
              mirroring viewport views.
            </p>
          </div>
          <div className="p-4 bg-page-bg-alt border border-border rounded-lg">
            <h3 className="font-semibold text-text-primary font-mono text-sm">
              src-tauri/
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Contains the Rust desktop backend launcher that manages windowing,
              tray setup, and application hooks.
            </p>
          </div>
          <div className="p-4 bg-page-bg-alt border border-border rounded-lg">
            <h3 className="font-semibold text-text-primary font-mono text-sm">
              src-tauri/crates/mirin-core/
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Contains the core backend services, including ADB commands,
              scrcpy process lifecycle, and file transfer parsers.
            </p>
          </div>
          <div className="p-4 bg-page-bg-alt border border-border rounded-lg">
            <h3 className="font-semibold text-text-primary font-mono text-sm">
              src-tauri/crates/mirin-mcp/
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Contains the Model Context Protocol server that implements
              JSON-RPC 2.0 tool execution and resource streaming.
            </p>
          </div>
          <div className="p-4 bg-page-bg-alt border border-border rounded-lg">
            <h3 className="font-semibold text-text-primary font-mono text-sm">
              src-tauri/crates/mirin-cli/
            </h3>
            <p className="text-xs text-text-muted mt-1">
              Contains the standalone CLI entry point for headless device list
              and MCP executions.
            </p>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
          <GitBranch size={22} className="text-accent" /> Frontend Communication
        </h2>
        <p className="text-text-muted leading-relaxed">
          The React frontend communicates with the Tauri backend via
          Inter-Process Communication (IPC). To maintain clean code boundaries,
          components must use the service layer to trigger backend operations
          rather than invoking Tauri commands directly.
        </p>
        <ul className="text-sm text-text-muted space-y-2 list-disc pl-5">
          <li>
            React components import wrappers from{" "}
            <code className="text-xs bg-page-bg px-1 rounded">
              src/services/
            </code>{" "}
            to initiate actions.
          </li>
          <li>
            The service wrappers execute the Tauri{" "}
            <code className="text-xs bg-page-bg px-1 rounded">invoke</code>{" "}
            function under the hood.
          </li>
          <li>
            The TS file{" "}
            <code className="text-xs bg-page-bg px-1 rounded">
              src/types/tauri-commands.ts
            </code>{" "}
            defines the types for data sent or received over IPC to prevent
            runtime deserialization failures.
          </li>
        </ul>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
          <Terminal size={22} className="text-accent" /> Backend Crate Structure
        </h2>
        <p className="text-text-muted leading-relaxed">
          The Rust backend implements the system logic in a set of specialized
          modules under the core crate:
        </p>
        <ul className="text-sm text-text-muted space-y-2 list-disc pl-5">
          <li>
            <strong>mirin_core::adb</strong>: Wraps the Android Debug Bridge,
            providing device detection, wireless pairing, and status checks.
          </li>
          <li>
            <strong>mirin_core::scrcpy</strong>: Manages the scrcpy server
            process lifecycle, handles video decoding configuration, and
            processes screen control commands.
          </li>
          <li>
            <strong>mirin_core::ui_extractor</strong>: Parses the UI layout tree
            from connected devices to locate components by their properties.
          </li>
          <li>
            <strong>mirin_core::settings</strong>: Manages persistent JSON
            settings, implementing strict bounds checking and sanitization.
          </li>
        </ul>
      </section>
    </>
  );
}
