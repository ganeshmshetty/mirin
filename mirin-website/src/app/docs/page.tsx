"use client";
import React from "react";
import { Zap, ShieldCheck, Smartphone, Cpu, MonitorSmartphone } from "lucide-react";

export default function DocsOverview() {
  return (
    <>
      <section className="space-y-4">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">Overview</h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Mirin is a desktop application built with Tauri 2.0 that provides an intuitive GUI for controlling Android devices via scrcpy.
        </p>
        <p className="text-text-muted leading-relaxed">
          Unlike standard mirroring utilities, Mirin is engineered for developers and AI agents. It combines ultra-low latency hardware acceleration via bundled <code className="text-accent bg-accent-soft px-1.5 py-0.5 rounded text-sm">scrcpy-server</code> binaries with an integrated Model Context Protocol (MCP) server, allowing language models and AI IDEs to visually inspect and automate connected hardware.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">Key Features</h2>
        <div className="grid gap-4">
          <div className="flex gap-4 p-4 bg-page-bg-alt border border-border rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
              <MonitorSmartphone size={20} className="text-accent" />
            </div>
            <div>
              <h3 className="font-medium text-text-primary">High-Performance Mirroring</h3>
              <p className="text-sm text-text-muted mt-1">Hardware-accelerated screen mirroring at 60+ FPS with mouse, keyboard, and touch input forwarding.</p>
            </div>
          </div>
          <div className="flex gap-4 p-4 bg-page-bg-alt border border-border rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
              <Cpu size={20} className="text-accent" />
            </div>
            <div>
              <h3 className="font-medium text-text-primary">MCP Server Built In</h3>
              <p className="text-sm text-text-muted mt-1">Native MCP server on localhost:48484. Claude Desktop, Cursor, and any MCP client can drive your device directly.</p>
            </div>
          </div>
          <div className="flex gap-4 p-4 bg-page-bg-alt border border-border rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
              <Zap size={20} className="text-accent" />
            </div>
            <div>
              <h3 className="font-medium text-text-primary">Zero-Touch Reconnection</h3>
              <p className="text-sm text-text-muted mt-1">Mirin remembers every device you pair. No need to re-type IP addresses — saved devices appear instantly for one-click reconnection.</p>
            </div>
          </div>
          <div className="flex gap-4 p-4 bg-page-bg-alt border border-border rounded-lg">
            <div className="w-10 h-10 rounded-lg bg-accent-soft flex items-center justify-center shrink-0">
              <ShieldCheck size={20} className="text-accent" />
            </div>
            <div>
              <h3 className="font-medium text-text-primary">Works with Android 11+</h3>
              <p className="text-sm text-text-muted mt-1">Supports both USB and wireless (TCP/IP) connections on any device running Android 11 or newer with developer options enabled.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
