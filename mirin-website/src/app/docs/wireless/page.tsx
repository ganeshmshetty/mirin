"use client";
import React from "react";
import { Wifi, Smartphone, Monitor } from "lucide-react";

export default function WirelessPage() {
  return (
    <>
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">Wireless Setup</h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Connect your Android device over Wi-Fi — no cables needed after initial pairing.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">Prerequisites</h2>
        <ul className="text-sm text-text-muted space-y-2 list-disc pl-5">
          <li>Android 11+ with <strong>Developer Options</strong> and <strong>Wireless Debugging</strong> enabled</li>
          <li>Computer and Android device on the <strong>same local network</strong></li>
          <li>Mirin installed and running</li>
        </ul>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-text-primary">Pairing Guide</h2>

        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">1</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary">Open Wireless Debugging</h3>
            <p className="text-sm text-text-muted">On your Android device, go to <code className="text-xs bg-page-bg px-1 rounded">Settings → Developer Options → Wireless Debugging</code> and enable it.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">2</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary">Open Mirin → Wireless Setup</h3>
            <p className="text-sm text-text-muted">In Mirin, click <strong>Add Device</strong> in the sidebar. A pairing window opens with a QR code and manual pairing fields.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">3</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary">Pair the Device</h3>
            <p className="text-sm text-text-muted">Tap <strong>Pair with QR code</strong> on your phone and scan the code shown in Mirin. Alternatively, enter the pairing code and port displayed on your phone into Mirin's manual input fields.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">4</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary">Auto-Saved</h3>
            <p className="text-sm text-text-muted">Once paired, the device is saved. Future connections are one-click — just press <strong>Connect</strong> on the saved device card.</p>
          </div>
        </div>
      </section>

      <hr className="border-border" />

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-text-primary">Tips</h2>
        <div className="p-4 bg-page-bg-alt border border-border rounded-lg space-y-3">
          <div className="flex items-start gap-3">
            <Wifi size={16} className="text-accent shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-text-primary">Same Network Required</h4>
              <p className="text-xs text-text-muted">Both devices must be on the same subnet. Corporate or public Wi-Fi networks may block peer-to-peer connections.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Smartphone size={16} className="text-accent shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-text-primary">Persistent Connection</h4>
              <p className="text-xs text-text-muted">Wireless debugging may disconnect if the phone goes to sleep. Keep the screen on or disable battery optimization for Developer Options.</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Monitor size={16} className="text-accent shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium text-text-primary">Firewall Notes</h4>
              <p className="text-xs text-text-muted">Ensure your firewall allows ADB traffic on port 5555 (or the custom port used during pairing).</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
