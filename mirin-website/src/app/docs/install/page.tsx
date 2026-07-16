"use client";
import React, { useState } from "react";
import { Terminal, Check, Copy, Apple, Wifi } from "lucide-react";

const AppleIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 384 512" fill="currentColor" className={className}>
    <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-48.7-22.7-77.9-22-34.8.5-70.8 20.2-88.4 54.6-37.5 73.3-9.6 180.2 26.8 233.3 17.8 25.8 39 51.2 65.9 50.2 26.6-1 36.6-17.1 69-17.1 32.2 0 41.3 17.1 69 16.6 27.9-.5 46.2-22.9 63.8-49 20.3-29.6 28.7-58.3 29.1-59.8-.7-.3-56.9-22-57.1-86.8zM245.9 76.1c25.4-30.2 42-72.1 37.3-113.9-35.6 1.4-78.9 23.6-104.5 53.6-22.2 25.8-41.6 68.6-36.3 109.9 39.7 3.1 80-19.4 103.5-49.6z"/>
  </svg>
);

const WindowsIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 448 512" fill="currentColor" className={className}>
    <path d="M0 93.7l183.6-25.3v177.4H0V93.7zm0 178.6h183.6v177.4L0 424.3V272.3zM201.2 65L448 31.2v216.2H201.2V65zm0 207.3H448v216.2L201.2 457V272.3z"/>
  </svg>
);

export default function InstallPage() {
  const [copiedText, setCopiedText] = useState("");

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(""), 2000);
  };

  return (
    <>
      <section className="space-y-6">
        <h1 className="text-4xl font-semibold text-text-primary tracking-tight">Installation</h1>
        <p className="text-lg text-text-muted leading-relaxed">
          Mirin runs on macOS and Windows. You need an Android device with Developer Options and USB Debugging enabled.
        </p>

        <div className="space-y-4">
          <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <AppleIcon className="w-5 h-5 text-text-muted" /> macOS
          </h2>
          <p className="text-sm text-text-muted">Install via Homebrew Cask (recommended):</p>
          <div className="flex justify-between items-center bg-page-bg-alt border border-border rounded-lg pl-4 pr-2 py-2 text-sm font-mono text-text-muted">
            <span>brew install --cask ganeshmshetty/tap/mirin</span>
            <button onClick={() => handleCopy("brew install --cask ganeshmshetty/tap/mirin", "brew")} className="p-1.5 hover:bg-border rounded text-text-primary transition-colors">
              {copiedText === "brew" ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
            </button>
          </div>
          <p className="text-xs text-text-muted">Alternatively, download the <code className="text-accent bg-accent-soft px-1 rounded">.dmg</code> from the GitHub releases page.</p>
        </div>

        <div className="space-y-4 pt-4">
          <h2 className="text-2xl font-semibold text-text-primary flex items-center gap-2">
            <WindowsIcon className="w-5 h-5 text-text-muted" /> Windows
          </h2>
          <p className="text-sm text-text-muted">Download the <code className="text-accent bg-accent-soft px-1 rounded">.msi</code> package from GitHub releases, double-click, and follow the installer prompts.</p>
        </div>

        <div className="bg-page-bg-alt border border-border rounded-lg p-4 space-y-3 mt-4">
          <h3 className="text-sm font-medium text-text-primary flex items-center gap-2">
            <Terminal size={15} className="text-accent" /> Android Prerequisites
          </h3>
          <ul className="text-sm text-text-muted space-y-2 list-disc pl-5">
            <li>Enable <strong>Developer Options</strong>: <code className="text-xs bg-page-bg px-1 rounded">Settings → About Phone → Tap Build Number 7 times</code></li>
            <li>Enable <strong>USB Debugging</strong> inside Developer Options</li>
            <li>For wireless connections, enable <strong>Wireless Debugging</strong> and keep both devices on the same network</li>
          </ul>
        </div>
      </section>
    </>
  );
}
