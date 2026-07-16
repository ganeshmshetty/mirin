"use client";
import React from "react";
import { AlertCircle, Wifi, Smartphone, Terminal, RefreshCw, ShieldAlert } from "lucide-react";

export default function TroublePage() {
  return (
    <>
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">Troubleshooting</h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Common issues and how to resolve them.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <div className="border-l-4 border-accent pl-5 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <ShieldAlert size={16} className="text-accent" />
            <h4 className="font-semibold text-text-primary">ADB Unauthorized</h4>
          </div>
          <p className="text-sm text-text-muted">
            Your device shows <code className="text-xs bg-page-bg px-1 rounded">Unauthorized</code> in Mirin. Accept the <strong>"Allow USB Debugging?"</strong> prompt on your phone. If dismissed, unplug and reconnect the USB cable, or revoke USB debugging authorizations in Developer Options and try again.
          </p>
        </div>

        <div className="border-l-4 border-accent pl-5 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <Terminal size={16} className="text-accent" />
            <h4 className="font-semibold text-text-primary">Device Not Detected</h4>
          </div>
          <p className="text-sm text-text-muted">
            Ensure USB Debugging is enabled in Developer Options. Try a different USB cable — some charge-only cables don't support data. On Windows, you may need to install the Google USB driver.
          </p>
        </div>

        <div className="border-l-4 border-accent pl-5 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <Wifi size={16} className="text-accent" />
            <h4 className="font-semibold text-text-primary">Wireless Pairing Fails</h4>
          </div>
          <p className="text-sm text-text-muted">
            Verify both devices are on the same local subnet. Some public, corporate, or guest networks block peer-to-peer mDNS and TCP traffic. Try switching to a mobile hotspot or a different network.
          </p>
        </div>

        <div className="border-l-4 border-accent pl-5 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <Smartphone size={16} className="text-accent" />
            <h4 className="font-semibold text-text-primary">Mirroring Lag or Freezes</h4>
          </div>
          <p className="text-sm text-text-muted">
            Lower the bitrate in device settings. For wireless connections, ensure strong Wi-Fi signal. Close other bandwidth-heavy applications. Try switching to USB for the best performance.
          </p>
        </div>

        <div className="border-l-4 border-accent pl-5 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <RefreshCw size={16} className="text-accent" />
            <h4 className="font-semibold text-text-primary">ADB Server Issues</h4>
          </div>
          <p className="text-sm text-text-muted">
            If ADB stops responding, restart it from Mirin's settings panel. On rare occasions, killing and restarting the ADB server resolves stale state.
          </p>
        </div>

        <div className="border-l-4 border-accent pl-5 py-3 space-y-1">
          <div className="flex items-center gap-2">
            <AlertCircle size={16} className="text-accent" />
            <h4 className="font-semibold text-text-primary">MCP Connection Refused</h4>
          </div>
          <p className="text-sm text-text-muted">
            Ensure Mirin is running with <code className="text-xs bg-page-bg px-1 rounded">--mcp</code> flag before starting your MCP client. The server listens on <code className="text-xs bg-page-bg px-1 rounded">127.0.0.1:48484</code> — check for port conflicts.
          </p>
        </div>
      </section>
    </>
  );
}
