"use client";
import React, { useEffect, useState } from "react";
import { BookOpen, Terminal, MonitorSmartphone, Wifi, Cpu, HelpCircle, ChevronRight, Apple, Download, Check, Copy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

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

const navGroups = [
  {
    category: "Getting Started",
    items: [
      { path: "/docs", label: "Overview", icon: BookOpen },
      { path: "/docs/install", label: "Installation", icon: Terminal },
      { path: "/docs/quickstart", label: "Quickstart", icon: MonitorSmartphone },
      { path: "/docs/wireless", label: "Wireless Setup", icon: Wifi },
    ],
  },
  {
    category: "Integration",
    items: [
      { path: "/docs/mcp", label: "MCP Server", icon: Cpu },
    ],
  },
  {
    category: "Reference",
    items: [
      { path: "/docs/cli", label: "CLI Reference", icon: Terminal },
      { path: "/docs/architecture", label: "Architecture", icon: BookOpen },
    ],
  },
  {
    category: "Support",
    items: [
      { path: "/docs/trouble", label: "Troubleshooting", icon: HelpCircle },
    ],
  },
];

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
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

  return (
    <div className="bg-page-bg text-text-primary min-h-screen selection:bg-accent-soft selection:text-accent font-sans">
      <nav className="navbar fixed top-4 left-1/2 -translate-x-1/2 w-[calc(100%-32px)] max-w-5xl z-50 px-8 h-14 flex items-center justify-between rounded-full bg-white/90 border border-border shadow-[0_8px_30px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all duration-300">
        <Link href="/" className="flex items-center gap-2">
          <img src="/brand/icon-svg/full-lockup/Light-transparent.svg" alt="Mirin Logo" className="h-7 w-auto object-contain" />
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
              <AppleIcon className="w-4 h-4" /> Download
            </button>
          ) : detectedOS === "windows" ? (
            <button className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <WindowsIcon className="w-4 h-4" /> Download
            </button>
          ) : (
            <button className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <Download size={15} /> Download
            </button>
          )}
        </div>
      </nav>

      <div className="max-w-6xl mx-auto pt-32 pb-24 px-6 flex flex-col md:flex-row gap-12">
        <aside className="w-full md:w-64 shrink-0 md:sticky md:top-28 h-fit">
          <div className="flex flex-col gap-6">
            {navGroups.map((group) => (
              <div key={group.category} className="flex flex-col gap-1">
                <div className="px-3 py-1 text-text-muted text-xs font-semibold uppercase tracking-wider">
                  {group.category}
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = pathname === item.path;
                  return (
                    <Link
                      key={item.path}
                      href={item.path}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                        isActive
                          ? "bg-accent-soft text-accent"
                          : "text-text-muted hover:bg-page-bg-alt hover:text-text-primary"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <Icon size={16} />
                        <span>{item.label}</span>
                      </div>
                      <ChevronRight size={14} className={`${isActive ? "opacity-100" : "opacity-0"}`} />
                    </Link>
                  );
                })}
              </div>
            ))}
          </div>
        </aside>

        <main className="flex-1 max-w-3xl space-y-16">
          {children}
        </main>
      </div>

      <footer className="py-12 px-6 max-w-6xl mx-auto border-t border-border flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <img src="/brand/icon-svg/full-lockup/Light-transparent.svg" alt="Mirin Logo" className="h-6 w-auto object-contain opacity-80" />
        </div>
        <div className="flex gap-8 text-sm font-medium text-text-muted">
          <a href="https://github.com/ganeshmshetty/mirin" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">GitHub</a>
          <Link href="/docs" className="hover:text-text-primary transition-colors">Documentation</Link>
          <Link href="/docs/mcp" className="hover:text-text-primary transition-colors">MCP Reference</Link>
          <a href="https://github.com/ganeshmshetty/mirin/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="hover:text-text-primary transition-colors">License</a>
        </div>
      </footer>
    </div>
  );
}
