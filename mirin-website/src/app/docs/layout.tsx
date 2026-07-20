"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { ThemeToggle } from "@/components/ThemeToggle";

const groups = [
  ["Getting started", ["", "getting-started/installation", "getting-started/first-mirror"]],
  ["Guides", ["guides/wireless-pairing", "guides/device-management", "guides/mirroring", "guides/files-and-apps", "guides/troubleshooting"]],
  ["Reference", ["reference/settings", "reference/cli", "reference/mcp", "reference/mcp-tools", "reference/mcp-resources"]],
  ["Development", ["explanation/architecture", "development/setup", "development/contributing"]],
] as const;

const labels: Record<string, string> = {
  "": "Overview",
  "getting-started/installation": "Installation",
  "getting-started/first-mirror": "First mirror",
  "guides/wireless-pairing": "Wireless pairing",
  "guides/device-management": "Device management",
  "guides/mirroring": "Mirroring",
  "guides/files-and-apps": "Files and apps",
  "guides/troubleshooting": "Troubleshooting",
  "reference/settings": "Settings",
  "reference/cli": "CLI",
  "reference/mcp": "MCP",
  "reference/mcp-tools": "MCP tools",
  "reference/mcp-resources": "MCP resources",
  "explanation/architecture": "Architecture",
  "development/setup": "Development setup",
  "development/contributing": "Contributing",
};

function MenuIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="3" y1="6" x2="17" y2="6" />
      <line x1="3" y1="10" x2="17" y2="10" />
      <line x1="3" y1="14" x2="17" y2="14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
      <line x1="4" y1="4" x2="16" y2="16" />
      <line x1="16" y1="4" x2="4" y2="16" />
    </svg>
  );
}

function SidebarContent({ pathname, onNav }: { pathname: string; onNav?: () => void }) {
  return (
    <div className="space-y-7">
      {groups.map(([name, paths]) => (
        <section key={name}>
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">{name}</h2>
          <div className="space-y-1">
            {paths.map((p) => {
              const to = `/docs${p ? `/${p}` : ""}`;
              return (
                <Link
                  key={p}
                  href={to}
                  onClick={onNav}
                  className={`block rounded-md px-3 py-2 text-sm transition-colors ${
                    pathname === to
                      ? "bg-accent-soft text-accent"
                      : "text-text-muted hover:bg-page-bg-alt hover:text-text-primary"
                  }`}
                >
                  {labels[p]}
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default function DocsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  // Close drawer on route change
  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Lock body scroll when drawer is open
  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [menuOpen]);

  return (
    <div className="min-h-screen bg-page-bg text-text-primary transition-colors duration-200">
      {/* Top nav */}
      <nav className="sticky top-0 z-30 border-b border-border bg-page-bg/90 backdrop-blur transition-colors duration-200">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md text-text-muted hover:text-text-primary hover:bg-page-bg-alt transition-colors"
              aria-label="Toggle navigation"
            >
              {menuOpen ? <CloseIcon /> : <MenuIcon />}
            </button>
            <Link href="/" className="font-semibold tracking-tight">
              Mirin <span className="text-accent">Docs</span>
            </Link>
          </div>
          <div className="flex items-center gap-3">
            <a
              className="text-sm text-text-muted hover:text-text-primary transition-colors hidden sm:block"
              href="https://github.com/ganeshmshetty/mirin"
            >
              GitHub
            </a>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Mobile drawer overlay */}
      {menuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/40 lg:hidden"
          onClick={() => setMenuOpen(false)}
        />
      )}

      {/* Mobile drawer */}
      <div
        className={`fixed top-14 left-0 bottom-0 z-20 w-72 bg-page-bg border-r border-border overflow-y-auto transition-transform duration-200 lg:hidden ${
          menuOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="p-5">
          <SidebarContent pathname={pathname} onNav={() => setMenuOpen(false)} />
        </div>
      </div>

      {/* Main layout */}
      <div className="mx-auto grid max-w-6xl gap-10 px-4 sm:px-6 py-10 lg:grid-cols-[220px_minmax(0,1fr)]">
        {/* Desktop sidebar */}
        <aside className="hidden lg:block space-y-7 lg:sticky lg:top-24 lg:h-fit">
          <SidebarContent pathname={pathname} />
        </aside>
        <main className="min-w-0 max-w-3xl">{children}</main>
      </div>
    </div>
  );
}
