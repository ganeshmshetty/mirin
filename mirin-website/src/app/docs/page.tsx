"use client";
import React, { useState, useEffect } from "react";
import { MonitorSmartphone, BookOpen, Terminal, Cpu, Settings, FileText, ChevronRight, Apple, HelpCircle, Check, Copy, Wifi, Download } from "lucide-react";
import Link from "next/link";

// Apple & Windows SVG Icons
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

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState("intro");
  const [copiedText, setCopiedText] = useState("");
  const [detectedOS, setDetectedOS] = useState<"mac" | "windows" | "other">("other");

  useEffect(() => {
    if (typeof window !== "undefined") {
      const platform = window.navigator.platform.toLowerCase();
      const userAgent = window.navigator.userAgent.toLowerCase();
      if (platform.includes("mac") || userAgent.includes("mac")) {
        setDetectedOS("mac");
      } else if (platform.includes("win") || userAgent.includes("win")) {
        setDetectedOS("windows");
      }
    }
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedText(id);
    setTimeout(() => setCopiedText(""), 2000);
  };

  const navItems = [
    { id: "intro", label: "Introduction", icon: BookOpen },
    { id: "install", label: "Installation", icon: Terminal },
    { id: "wireless", label: "Wireless Setup", icon: Wifi },
    { id: "mcp", label: "MCP Integration", icon: Cpu },
    { id: "trouble", label: "Troubleshooting", icon: HelpCircle },
  ];

  return (
    <div className="bg-page-bg text-text-primary min-h-screen selection:bg-accent-soft selection:text-accent font-sans">
      
      {/* FIXED FLOATING NAVBAR */}
      <nav className="navbar fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-5xl z-50 px-8 h-14 flex items-center justify-between rounded-full bg-white/90 border border-border shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all duration-300">
        <Link href="/" className="flex items-center gap-2">
          <img 
            src="/brand/icon-svg/full-lockup/Light-transparent.svg" 
            alt="Mirin Logo" 
            className="h-7 w-auto object-contain"
          />
        </Link>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-text-muted">
          <Link href="/#setup-config" className="hover:text-text-primary transition-colors">Setup & Config</Link>
          <Link href="/#automation" className="hover:text-text-primary transition-colors">Automation</Link>
          <Link href="/#workspace" className="hover:text-text-primary transition-colors">Workspace</Link>
          <Link href="/docs" className="text-accent transition-colors">Docs</Link>
        </div>
        <div>
          {detectedOS === "mac" ? (
            <button className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <AppleIcon className="w-4 h-4" /> Download for macOS
            </button>
          ) : detectedOS === "windows" ? (
            <button className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <WindowsIcon className="w-4 h-4" /> Download for Windows
            </button>
          ) : (
            <button className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <Download size={15} /> Download Mirin
            </button>
          )}
        </div>
      </nav>

      {/* DOCS CONTAINER */}
      <div className="max-w-6xl mx-auto pt-32 pb-24 px-6 flex flex-col md:flex-row gap-12">
        
        {/* SIDEBAR NAVIGATION */}
        <aside className="w-full md:w-64 shrink-0 md:sticky md:top-28 h-fit">
          <div className="flex flex-col gap-1">
            <div className="px-3 py-2 text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">Documentation</div>
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveSection(item.id);
                    document.getElementById(item.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all text-left w-full ${
                    isActive 
                      ? "bg-accent-soft text-accent" 
                      : "text-text-muted hover:bg-page-bg-alt hover:text-text-primary"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon size={16} />
                    <span>{item.label}</span>
                  </div>
                  <ChevronRight size={14} className={`transition-transform ${isActive ? "rotate-90" : "opacity-0"}`} />
                </button>
              );
            })}
          </div>
        </aside>

        {/* MAIN CONTENT */}
        <main className="flex-1 max-w-3xl space-y-16">
          {/* OVERVIEW */}
          <section id="overview" className="space-y-4">
            <h1 className="text-4xl font-semibold text-text-primary tracking-tight">Overview</h1>
            <p className="text-lg text-text-muted leading-relaxed">
              Welcome to the Mirin documentation workspace. Mirin is a desktop application built with Tauri 2.0 that provides an intuitive interface for configuring and controlling Android devices.
            </p>
            <p className="text-text-muted leading-relaxed">
              Unlike standard mirroring utilities, Mirin is engineered for developers and AI agents. It combines ultra-low latency hardware acceleration via bundled `scrcpy-server` binaries with an integrated Model Context Protocol (MCP) server, allowing language models and AI IDEs to visually inspect and automate connected hardware.
            </p>
          </section>

          <hr className="border-border" />

          {/* INSTALLATION */}
          <section id="installation" className="space-y-6">
            <h2 className="text-2xl font-semibold text-text-primary">Installation</h2>
            <p className="text-text-muted leading-relaxed">
              Mirin requires a desktop operating system (macOS or Windows) and a connected Android device with USB Debugging or Wireless Debugging enabled.
            </p>

            <div className="space-y-4">
              <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
                <AppleIcon className="w-4 h-4 text-text-muted" /> macOS (Apple Silicon & Intel)
              </h3>
              <p className="text-sm text-text-muted">The recommended way to install Mirin on macOS is via Homebrew Cask:</p>
              <div className="flex justify-between items-center bg-page-bg-alt border border-border rounded-lg pl-4 pr-2 py-2 text-sm font-mono text-text-muted">
                <span>brew install --cask ganeshmshetty/tap/mirin</span>
                <button 
                  onClick={() => handleCopy("brew install --cask ganeshmshetty/tap/mirin", "brew")} 
                  aria-label="Copy install command"
                  className="p-1.5 hover:bg-border rounded text-text-primary transition-colors"
                >
                  {copiedText === "brew" ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
                </button>
              </div>
              <p className="text-xs text-text-muted">
                Alternatively, you can manually download the `.dmg` installer directly from the GitHub releases page.
              </p>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="text-lg font-medium text-text-primary flex items-center gap-2">
                <WindowsIcon className="w-4 h-4 text-text-muted" /> Windows 10 & 11
              </h3>
              <p className="text-sm text-text-muted">
                Download the official `.msi` package from GitHub, double-click the installer, and follow the on-screen configuration guidelines.
              </p>
            </div>

            <div className="bg-page-bg-alt border border-border rounded-lg p-4 space-y-2 mt-4">
              <h4 className="text-sm font-medium text-text-primary flex items-center gap-2">
                <Terminal size={15} className="text-accent" /> Android Device Prerequisites
              </h4>
              <ul className="text-sm text-text-muted space-y-1 list-disc pl-5">
                <li>Enable <strong>Developer Options</strong> on your Android device (`Settings &gt; About Phone &gt; Tap Build Number 7 times`).</li>
                <li>Enable <strong>USB Debugging</strong> within Developer Options.</li>
                <li>For Wi-Fi mirroring, ensure your computer and Android device are connected to the same local network and enable <strong>Wireless Debugging</strong>.</li>
              </ul>
            </div>
          </section>

          <hr className="border-border" />

          {/* QUICKSTART */}
          <section id="quickstart" className="space-y-6">
            <h2 className="text-2xl font-semibold text-text-primary">Quickstart</h2>
            <div className="space-y-4">
              <div className="flex gap-4 items-start">
                <div className="w-7 h-7 rounded-full bg-page-bg-alt border border-border flex items-center justify-center shrink-0 text-sm font-semibold text-text-primary">1</div>
                <div className="space-y-1">
                  <h3 className="font-medium text-text-primary">Connect your Android device</h3>
                  <p className="text-sm text-text-muted">Plug in your Android device via USB. Accept the RSA fingerprint prompt on your mobile screen allowing USB debugging from your desktop.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-7 h-7 rounded-full bg-page-bg-alt border border-border flex items-center justify-center shrink-0 text-sm font-semibold text-text-primary">2</div>
                <div className="space-y-1">
                  <h3 className="font-medium text-text-primary">Launch Mirin</h3>
                  <p className="text-sm text-text-muted">Open the Mirin desktop application. Your device will automatically appear in the active hardware list with its model name, serial number, and connection mode.</p>
                </div>
              </div>

              <div className="flex gap-4 items-start">
                <div className="w-7 h-7 rounded-full bg-page-bg-alt border border-border flex items-center justify-center shrink-0 text-sm font-semibold text-text-primary">3</div>
                <div className="space-y-1">
                  <h3 className="font-medium text-text-primary">Start Mirroring</h3>
                  <p className="text-sm text-text-muted">Click the <strong>Start Mirroring</strong> button on your device card. A high-fps hardware-accelerated viewport will launch, allowing mouse clicks, drag events, and physical keyboard passthrough.</p>
                </div>
              </div>
            </div>
          </section>

          <hr className="border-border" />

          {/* MCP SERVER */}
          <section id="mcp" className="space-y-6">
            <h2 className="text-2xl font-semibold text-text-primary">Model Context Protocol (MCP)</h2>
            <p className="text-text-muted leading-relaxed">
              Mirin includes a native Model Context Protocol (MCP) server that runs as a loopback bridge on `127.0.0.1:48484`. This empowers local AI assistants—such as Claude Desktop, Cursor, or Claude Code—to interact directly with your Android screen and hardware sensors.
            </p>

            <div className="space-y-3">
              <h3 className="text-lg font-medium text-text-primary">Configuring Claude Desktop</h3>
              <p className="text-sm text-text-muted">
                Add the following JSON snippet to your `claude_desktop_config.json` configuration file (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):
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
                <button 
                  onClick={() => handleCopy(`{\n  "mcpServers": {\n    "mirin": {\n      "command": "mirin",\n      "args": ["--mcp"]\n    }\n  }\n}`, "mcp-json")} 
                  aria-label="Copy configuration snippet"
                  className="p-1.5 hover:bg-app-card rounded text-app-text-muted hover:text-app-text transition-colors absolute top-2 right-2 border border-app-border"
                >
                  {copiedText === "mcp-json" ? <Check size={14} className="text-app-primary" /> : <Copy size={14} />}
                </button>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="text-xl font-semibold text-text-primary">Available Tools</h3>
              <p className="text-sm text-text-muted">Once active, AI agents gain access to the following JSON-RPC commands:</p>
              <div className="space-y-3">
                <div className="p-3 bg-page-bg-alt border border-border rounded-lg space-y-1">
                  <div className="font-mono text-xs font-semibold text-accent">list_devices</div>
                  <p className="text-xs text-text-muted">Returns a structured JSON list of all connected hardware serials, device states, and battery metadata.</p>
                </div>
                <div className="p-3 bg-page-bg-alt border border-border rounded-lg space-y-1">
                  <div className="font-mono text-xs font-semibold text-accent">get_screenshot</div>
                  <p className="text-xs text-text-muted">Captures the current screen. Supports Set-of-Mark (`annotate: true`) high-contrast numbered bounding boxes overlays drawn directly on GPU buffers without persisting data.</p>
                </div>
                <div className="p-3 bg-page-bg-alt border border-border rounded-lg space-y-1">
                  <div className="font-mono text-xs font-semibold text-accent">tap, long_press, swipe, drag</div>
                  <p className="text-xs text-text-muted">Executes touch actions using exact screen coordinates, semantic accessibility selectors (`"Allow"`), or assigned Set-of-Mark numeric IDs (`"4"`).</p>
                </div>
                <div className="p-3 bg-page-bg-alt border border-border rounded-lg space-y-1">
                  <div className="font-mono text-xs font-semibold text-accent">type_text, press_key</div>
                  <p className="text-xs text-text-muted">Injects keyboard strings and physical hardware keycodes (`HOME`, `BACK`, `ENTER`) via scrcpy control socket.</p>
                </div>
                <div className="p-3 bg-page-bg-alt border border-border rounded-lg space-y-1">
                  <div className="font-mono text-xs font-semibold text-accent">launch_app, stop_app, list_apps</div>
                  <p className="text-xs text-text-muted">Manages applications cleanly using Activity resolution without triggering noisy monkey randomness.</p>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION: TROUBLE */}
          <section id="trouble" className="scroll-mt-28 space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight text-text-primary">Troubleshooting</h2>
            <p className="text-text-muted leading-relaxed">
              If your device isn't showing up or mirroring fails, check these common fixes:
            </p>
            <div className="space-y-4">
              <div className="border-l-4 border-accent pl-4 py-1">
                <h4 className="font-semibold text-text-primary text-sm">ADB Unauthorized Error</h4>
                <p className="text-xs text-text-muted mt-1">
                  Ensure you accept the "Allow USB Debugging?" prompt on your phone screen. If you missed it, disconnect/reconnect the cable or run "Revoke USB debugging authorizations" in Developer Options.
                </p>
              </div>
              <div className="border-l-4 border-accent pl-4 py-1">
                <h4 className="font-semibold text-text-primary text-sm">Wireless device pairing fails</h4>
                <p className="text-xs text-text-muted mt-1">
                  Check if your device and host system are on the exact same local Wi-Fi subnet. Some public or corporate networks block device-to-device mDNS traffic.
                </p>
              </div>
            </div>
          </section>

        </main>
      </div>

      {/* FOOTER */}
      <footer className="py-12 px-6 max-w-6xl mx-auto border-t border-border flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <img 
            src="/brand/icon-svg/full-lockup/Light-transparent.svg" 
            alt="Mirin Logo" 
            className="h-6 w-auto object-contain opacity-80"
          />
        </div>
        <div className="flex gap-8 text-sm font-medium text-text-muted">
          <a href="https://github.com/ganeshmshetty/mirin" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">GitHub</a>
          <Link href="/docs" className="hover:text-text-primary transition-colors">Documentation</Link>
          <Link href="/docs#mcp" className="hover:text-text-primary transition-colors">MCP Reference</Link>
          <a href="https://github.com/ganeshmshetty/mirin/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">License</a>
        </div>
      </footer>

    </div>
  );
}
