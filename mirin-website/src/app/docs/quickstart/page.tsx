"use client";
import React from "react";

export default function QuickstartPage() {
  return (
    <>
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">Quickstart</h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Get your first device connected and mirrored in under a minute.
        </p>
      </section>

      <hr className="border-border" />

      <section className="space-y-6">
        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">1</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary text-lg">Connect via USB</h3>
            <p className="text-sm text-text-muted">Plug your Android device into your computer. Accept the <strong>Allow USB Debugging?</strong> RSA fingerprint prompt on your phone.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">2</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary text-lg">Launch Mirin</h3>
            <p className="text-sm text-text-muted">Open Mirin. Your device appears automatically in the device list with its model name, status, and connection type.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">3</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary text-lg">Start Mirroring</h3>
            <p className="text-sm text-text-muted">Click the device card to open its dashboard, then select <strong>Live / Overview</strong>. The mirrored viewport launches with mouse, keyboard, and touch input support.</p>
          </div>
        </div>

        <div className="flex gap-4 items-start">
          <div className="w-8 h-8 rounded-full bg-accent-soft border border-accent/30 flex items-center justify-center shrink-0 text-sm font-semibold text-accent">4</div>
          <div className="space-y-1 flex-1">
            <h3 className="font-medium text-text-primary text-lg">Save for Later</h3>
            <p className="text-sm text-text-muted">Wireless devices are automatically saved. Next time, just click <strong>Connect</strong> — no IP addresses to re-type.</p>
          </div>
        </div>
      </section>
    </>
  );
}
