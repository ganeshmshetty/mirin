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

        {/* DOCS CONTENT */}
        <main className="flex-1 max-w-3xl space-y-20">
          
          {/* SECTION: INTRO */}
          <section id="intro" className="scroll-mt-28 space-y-6">
            <h1 className="text-4xl font-semibold tracking-tight text-text-primary">Introduction</h1>
            <p className="text-lg text-text-muted leading-relaxed">
              Welcome to the Mirin documentation workspace. Mirin is a desktop application built with Tauri 2.0 that provides an intuitive interface for configuring and controlling Android devices.
            </p>
            <p className="text-text-muted leading-relaxed">
              Unlike typical command-line screen mirroring wrappers, Mirin treats device pairing, configuration mapping, automation endpoints, and local file sharing as first-class, built-in capabilities.
            </p>
            <div className="p-4 bg-page-bg-alt border border-border rounded-xl flex gap-4 items-start">
              <BookOpen className="text-accent shrink-0 mt-0.5" size={20} />
              <div className="text-sm text-text-muted">
                <strong>New to Mirin?</strong> Start with the installation guides below to get the workspace up and running on your system.
              </div>
            </div>
          </section>

          {/* SECTION: INSTALL */}
          <section id="install" className="scroll-mt-28 space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight text-text-primary">Installation</h2>
            <p className="text-text-muted leading-relaxed">
              Mirin supports both macOS (Intel & Apple Silicon) and Windows 10/11 operating systems. Follow the instructions corresponding to your system.
            </p>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                <AppleIcon className="w-5 h-5 text-text-primary" /> macOS setup
              </h3>
              <p className="text-sm text-text-muted">The recommended way to install Mirin on macOS is via Homebrew Cask:</p>
              <div className="flex justify-between items-center bg-page-bg-alt border border-border rounded-lg pl-4 pr-2 py-2 text-sm font-mono text-text-muted">
                <span>brew install --cask ganeshmshetty/tap/mirin</span>
                <button 
                  onClick={() => handleCopy("brew install --cask ganeshmshetty/tap/mirin", "brew")} 
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
              <h3 className="text-xl font-semibold text-text-primary flex items-center gap-2">
                <WindowsIcon className="w-5 h-5 text-text-primary" /> Windows setup
              </h3>
              <p className="text-sm text-text-muted">
                Download the official `.msi` package from GitHub, double-click the installer, and follow the on-screen configuration guidelines.
              </p>
            </div>
          </section>

          {/* SECTION: WIRELESS */}
          <section id="wireless" className="scroll-mt-28 space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight text-text-primary">Wireless Setup</h2>
            <p className="text-text-muted leading-relaxed">
              Mirin features automatic network scanning so you never have to locate your device IP address manually. Ensure your computer and device share the same Wi-Fi connection.
            </p>
            <ol className="list-decimal pl-5 space-y-3 text-text-muted">
              <li>Open Settings on your Android Device and navigate to <strong>Developer Options</strong>.</li>
              <li>Toggle <strong>Wireless Debugging</strong> to active.</li>
              <li>Select "Pair device with pairing code". You will be shown a 6-digit code and a port value.</li>
              <li>In Mirin, wait for the automatic scan to list your device and click <strong>Pair</strong>.</li>
              <li>Input the 6-digit pairing code. Once verified, Mirin stores the pairing key permanently.</li>
            </ol>
          </section>

          {/* SECTION: MCP */}
          <section id="mcp" className="scroll-mt-28 space-y-6">
            <h2 className="text-3xl font-semibold tracking-tight text-text-primary">Model Context Protocol (MCP)</h2>
            <p className="text-text-muted leading-relaxed">
              Mirin hosts a built-in Model Context Protocol (MCP) server that exposes device interaction interfaces to AI agents (like Claude Desktop or Cursor).
            </p>

            <div className="space-y-4">
              <h3 className="text-xl font-semibold text-text-primary">Claude Desktop Configuration</h3>
              <p className="text-sm text-text-muted">
                To connect Claude Desktop to your Mirin workspace, add the server setup to your global configuration file (`claude_desktop_config.json`):
              </p>
              <div className="relative">
                <pre className="bg-app-bg text-app-text p-4 rounded-xl text-xs font-mono border border-app-border overflow-x-auto">
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
                <div className="border border-border p-3 rounded-lg">
                  <div className="text-xs font-mono text-accent font-semibold">list_devices()</div>
                  <div className="text-xs text-text-muted mt-1">Queries ADB and returns all active connected hardware and wireless devices.</div>
                </div>
                <div className="border border-border p-3 rounded-lg">
                  <div className="text-xs font-mono text-accent font-semibold">take_screenshot(deviceId)</div>
                  <div className="text-xs text-text-muted mt-1">Directly accesses device framebuffer to return a Base64-encoded PNG image of the screen.</div>
                </div>
                <div className="border border-border p-3 rounded-lg">
                  <div className="text-xs font-mono text-accent font-semibold">send_input(deviceId, type, value)</div>
                  <div className="text-xs text-text-muted mt-1">Allows inputs such as tap coordinates, drag gestures, and simulated keyboard strings.</div>
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
          <a href="#" className="hover:text-text-primary transition-colors">GitHub</a>
          <a href="#" className="hover:text-text-primary transition-colors">Documentation</a>
          <a href="#" className="hover:text-text-primary transition-colors">MCP Reference</a>
          <a href="#" className="hover:text-text-primary transition-colors">License</a>
        </div>
      </footer>

    </div>
  );
}
