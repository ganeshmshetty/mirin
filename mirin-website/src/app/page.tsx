"use client";
import React, { useRef, useState, useEffect } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { Download, MonitorSmartphone, Settings2, Command, ShieldCheck, Zap, Copy, Check, TerminalSquare, Smartphone, MousePointer2, Settings, Wifi, FileInput, Laptop, Search } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

// ----------------------------------------------------------------------
// BRAND ICONS (SVG)
// ----------------------------------------------------------------------
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

// ----------------------------------------------------------------------
// MOCKUP COMPONENT
// ----------------------------------------------------------------------
const AppMockup = ({ children, className = "" }: { children: React.ReactNode, className?: string }) => (
  <div className={`rounded-2xl border border-border bg-page-bg-alt p-2 shadow-[0_20px_40px_rgba(0,0,0,0.06)] ${className}`}>
    <div className="rounded-xl overflow-hidden flex flex-col bg-app-bg border border-app-border h-full relative">
      {/* Mac window controls mock */}
      <div className="h-10 bg-app-sidebar flex items-center px-4 gap-2 border-b border-app-border shrink-0 z-10">
        <div className="flex gap-1.5">
          <div className="w-3 h-3 rounded-full bg-[#33373a]" />
          <div className="w-3 h-3 rounded-full bg-[#33373a]" />
          <div className="w-3 h-3 rounded-full bg-[#33373a]" />
        </div>
      </div>
      <div className="flex-1 flex overflow-hidden text-app-text text-sm z-0">
        {children}
      </div>
    </div>
  </div>
);

// ----------------------------------------------------------------------
// PAGE COMPONENTS
// ----------------------------------------------------------------------
export default function LandingPage() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
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

  useGSAP(() => {
    // Immediately snap navbar to the correct state based on current scroll
    // position — prevents the flash/collapse glitch on reload.
    const isScrolled = window.scrollY > 50;
    const navbarScrolledBg = getComputedStyle(document.documentElement).getPropertyValue("--page-bg").trim();
    const scrolledBgRgba = `color-mix(in srgb, ${navbarScrolledBg || "#ffffff"} 90%, transparent)`;
    gsap.set(".navbar", isScrolled ? {
      width: "calc(100% - 32px)",
      maxWidth: "1024px",
      top: "16px",
      borderRadius: "9999px",
      backgroundColor: "var(--page-bg)",
      borderColor: "var(--border)",
      boxShadow: "0 8px 30px rgba(0, 0, 0, 0.08)",
      paddingLeft: "32px",
      paddingRight: "32px",
      height: "56px",
    } : {
      width: "100%",
      maxWidth: "100%",
      top: "0px",
      borderRadius: "0px",
      backgroundColor: "transparent",
      borderColor: "transparent",
      boxShadow: "none",
      paddingLeft: "24px",
      paddingRight: "24px",
      height: "64px",
    });

    // Nav transition into a detached floating rounded pill
    ScrollTrigger.create({
      trigger: "body",
      start: "top -50",
      onEnter: () => {
        gsap.to(".navbar", {
          width: "calc(100% - 32px)",
          maxWidth: "1024px",
          top: "16px",
          borderRadius: "9999px",
          backgroundColor: "var(--page-bg)",
          borderColor: "var(--border)",
          boxShadow: "0 8px 30px rgba(0, 0, 0, 0.08)",
          paddingLeft: "32px",
          paddingRight: "32px",
          height: "56px",
          duration: 0.3,
          ease: "power2.out"
        });
      },
      onLeaveBack: () => {
        gsap.to(".navbar", {
          width: "100%",
          maxWidth: "100%",
          top: "0px",
          borderRadius: "0px",
          backgroundColor: "transparent",
          borderColor: "transparent",
          boxShadow: "none",
          paddingLeft: "24px",
          paddingRight: "24px",
          height: "64px",
          duration: 0.3,
          ease: "power2.out"
        });
      }
    });

    // Hero entrance
    const tl = gsap.timeline();
    tl.fromTo(".hero-elem", { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out" }, 0.1);

    // Hero mockup parallax
    gsap.fromTo(".hero-mockup-inner", 
      { yPercent: 0 },
      {
        yPercent: -8,
        ease: "none",
        scrollTrigger: {
          trigger: ".hero-mockup-container",
          start: "top bottom",
          end: "bottom top",
          scrub: true
        }
      }
    );

    // Trust strip
    gsap.fromTo(".trust-item",
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.6, stagger: 0.1, ease: "power2.out", scrollTrigger: { trigger: ".trust-strip", start: "top 85%" } }
    );

    // Feature sections basic entrance
    const features = gsap.utils.toArray(".feature-section");
    features.forEach((feature: any) => {
      const text = feature.querySelector(".feature-text");
      const mockup = feature.querySelector(".feature-mockup");

      gsap.fromTo(text, { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power2.out", scrollTrigger: { trigger: feature, start: "top 75%" } });
      gsap.fromTo(mockup, { opacity: 0, scale: 0.96 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power2.out", delay: 0.15, scrollTrigger: { trigger: feature, start: "top 75%" } });
    });

    // Combined Setup & Configuration Timeline
    const setupConfigTl = gsap.timeline({
      scrollTrigger: {
        trigger: "#setup-config",
        start: "top 55%",
        end: "bottom 35%",
        toggleActions: "play none none reverse",
      }
    });
    // 1. Device list item slides in
    setupConfigTl.fromTo(".setup-device-item", { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.4 });
    // 2. Click "Pair" simulation
    setupConfigTl.to(".setup-btn-pair", { scale: 0.94, duration: 0.1 }, "+=0.2");
    setupConfigTl.to(".setup-btn-pair", { scale: 1, duration: 0.1 });
    setupConfigTl.to(".setup-btn-pair", { opacity: 0, scale: 0.9, duration: 0.2 }, "+=0.1");
    setupConfigTl.to(".setup-btn-paired", { opacity: 1, scale: 1, duration: 0.2 }, "-=0.1");
    // 3. Cross-fade from Setup panel to Config settings panel
    setupConfigTl.to(".setup-panel-container", { opacity: 0, scale: 0.96, duration: 0.4 }, "+=0.4");
    setupConfigTl.to(".config-panel-container", { opacity: 1, scale: 1, pointerEvents: "auto", duration: 0.4 }, "-=0.2");
    // 4. Animate Settings Toggle and Profile swap
    setupConfigTl.to(".config-toggle-knob", { x: 12, duration: 0.3 }, "+=0.3");
    setupConfigTl.to(".config-toggle-bg", { backgroundColor: "var(--app-primary)", duration: 0.3 }, "-=0.3");
    setupConfigTl.to(".config-profile-gaming", { borderColor: "var(--color-border)", backgroundColor: "transparent", duration: 0.4 }, "+=0.2");
    setupConfigTl.to(".config-profile-gaming-text", { color: "var(--color-app-text)", duration: 0.4 }, "-=0.4");
    setupConfigTl.to(".config-profile-latency", { borderColor: "var(--app-primary)", backgroundColor: "var(--color-app-active-tab-bg)", duration: 0.4 }, "-=0.4");
    setupConfigTl.to(".config-profile-latency-text", { color: "var(--app-primary)", duration: 0.4 }, "-=0.4");

    // Marquee
    gsap.to(".marquee-track", {
      xPercent: -50,
      repeat: -1,
      ease: "none",
      duration: 20
    });
    
    // Tool calls pulse
    gsap.to(".tool-call-active", {
      backgroundColor: "var(--color-app-primary)",
      color: "#000",
      repeat: 1,
      yoyo: true,
      duration: 0.4,
      delay: 1,
      scrollTrigger: {
        trigger: ".tool-call-mockup",
        start: "top 80%"
      }
    });

  }, { scope: containerRef });

  const copyInstall = () => {
    navigator.clipboard.writeText("brew install --cask ganeshmshetty/tap/mirin");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div ref={containerRef} className="bg-page-bg text-text-primary min-h-screen selection:bg-accent-soft selection:text-accent font-sans">
      
      {/* 1. NAV */}
      <nav className="navbar fixed top-0 left-1/2 -translate-x-1/2 w-full z-50 px-6 h-16 flex items-center justify-between border-b border-transparent transition-all duration-300">
        <div className="flex items-center gap-2">
          <img src="/brand/icon-svg/full-lockup/Light-transparent.svg" alt="Mirin" className="h-7 w-auto object-contain dark:hidden" />
          <img src="/brand/icon-svg/full-lockup/Dark-transparent.svg" alt="Mirin" className="h-7 w-auto object-contain hidden dark:block" />
        </div>
        <div className="hidden md:flex items-center gap-8 text-sm font-medium text-text-muted">
          <Link href="/#setup-config" className="hover:text-text-primary transition-colors">Setup &amp; Config</Link>
          <Link href="/#automation" className="hover:text-text-primary transition-colors">Automation</Link>
          <Link href="/#workspace" className="hover:text-text-primary transition-colors">Workspace</Link>
          <Link href="/docs" className="hover:text-text-primary transition-colors">Docs</Link>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          {detectedOS === "mac" ? (
            <a href="https://github.com/ganeshmshetty/mirin/releases/latest" target="_blank" rel="noopener noreferrer" className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <AppleIcon className="w-4 h-4" /> Download for macOS
            </a>
          ) : detectedOS === "windows" ? (
            <a href="https://github.com/ganeshmshetty/mirin/releases/latest" target="_blank" rel="noopener noreferrer" className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <WindowsIcon className="w-4 h-4" /> Download for Windows
            </a>
          ) : (
            <a href="https://github.com/ganeshmshetty/mirin/releases/latest" target="_blank" rel="noopener noreferrer" className="bg-accent hover:bg-accent/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2">
              <Download size={15} /> Download Mirin
            </a>
          )}
        </div>
      </nav>

      {/* 2. HERO */}
      <section className="pt-40 pb-20 px-6 max-w-6xl mx-auto flex flex-col items-center text-center">
        <h1 className="hero-elem text-5xl md:text-6xl lg:text-[64px] font-semibold leading-[1.1] tracking-tight max-w-4xl text-text-primary mb-6">
          The control workspace for <br/> your <span className="text-accent">Android.</span>
        </h1>
        <p className="hero-elem text-lg md:text-xl text-text-muted max-w-2xl mb-10">
          Connect once. Mirin remembers your devices, your settings, and how you like to work.
        </p>
        
        <div className="hero-elem flex flex-col sm:flex-row items-center gap-4 mb-4">
          <a href="https://github.com/ganeshmshetty/mirin/releases/latest" target="_blank" rel="noopener noreferrer" className="bg-accent hover:bg-accent/90 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2.5 w-full sm:w-auto justify-center">
            <AppleIcon className="w-5 h-5" /> Download for macOS
          </a>
          <a href="https://github.com/ganeshmshetty/mirin/releases/latest" target="_blank" rel="noopener noreferrer" className="bg-page-bg border border-border hover:bg-page-bg-alt text-text-primary px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2.5 w-full sm:w-auto justify-center">
            <WindowsIcon className="w-5 h-5" /> Download for Windows
          </a>
        </div>
        
        <div className="hero-elem flex items-center gap-2 bg-page-bg-alt border border-border rounded-md pl-4 pr-2 py-1.5 text-sm text-text-muted font-mono mb-16">
          <span>brew install --cask ganeshmshetty/tap/mirin</span>
          <button onClick={copyInstall} className="p-1.5 hover:bg-border rounded text-text-primary transition-colors">
            {copied ? <Check size={14} className="text-accent" /> : <Copy size={14} />}
          </button>
        </div>

        {/* Hero Mockup */}
        <div className="hero-mockup-container hero-elem w-full max-w-5xl relative">
          <div className="hero-mockup-inner">
            <img 
              src="/hero-screenshot.png" 
              alt="Mirin Workspace Dashboard" 
              className="w-full h-auto object-contain"
            />
          </div>
        </div>
      </section>

      {/* 3. TRUST STRIP */}
      <section className="trust-strip border-y border-border bg-page-bg-alt py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-center gap-8 md:gap-16">
          <div className="trust-item flex items-center gap-3 text-text-muted text-sm font-medium">
            <Zap size={18} className="text-text-primary" /> No IP addresses to type
          </div>
          <div className="trust-item flex items-center gap-3 text-text-muted text-sm font-medium">
            <ShieldCheck size={18} className="text-text-primary" /> Remembers every device
          </div>
          <div className="trust-item flex items-center gap-3 text-text-muted text-sm font-medium">
            <Smartphone size={18} className="text-text-primary" /> Works with any Android 11+ phone
          </div>
        </div>
      </section>

      {/* 4. FEATURE: SETUP & CONFIG (COMBINED) */}
      <section id="setup-config" className="feature-section py-24 px-6 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-16">
        <div className="feature-text flex-1">
          <div className="text-[13px] font-semibold uppercase tracking-wider text-accent mb-3">01 / Setup & Configuration</div>
          <h2 className="text-3xl md:text-4xl font-semibold text-text-primary mb-4 leading-tight">
            Onboard in seconds. Configure your way.
          </h2>
          <p className="text-lg text-text-muted">
            Mirin auto-discovers your devices via USB or wireless connection. 
            Pair once, and they are stored in your device list permanently. 
            Tune individual performance profiles—switch presets like Gaming and 
            Low Latency or toggle features like screen touches. Best of all, settings 
            stick to the device, keeping your phone and tablet experiences separate.
          </p>
        </div>
        <div className="feature-mockup flex-1 w-full">
          <img 
            src="/setup-config-screenshot.png" 
            alt="Mirin Setup & Configuration" 
          />
        </div>
      </section>

      {/* 5. AUTOMATION / MCP */}
      <section id="automation" className="py-24 overflow-hidden bg-page-bg-alt border-y border-border">
        <div className="max-w-6xl mx-auto px-6 text-center mb-16">
          <div className="text-[13px] font-semibold uppercase tracking-wider text-accent mb-3">02 / Automation</div>
          <h2 className="text-3xl md:text-4xl font-semibold text-text-primary mb-4 leading-tight">
            Built for AI and automation.
          </h2>
          <p className="text-lg text-text-muted max-w-2xl mx-auto">
            Mirin ships with a built-in MCP server. Claude Desktop, Cursor, or any MCP client can connect and drive your device directly—perfect for automated testing and hands-free control.
          </p>
        </div>

        {/* Marquee Strip */}
        <div className="w-full flex overflow-hidden mb-16 relative">
          <div className="absolute left-0 w-32 h-full bg-gradient-to-r from-page-bg-alt to-transparent z-10"></div>
          <div className="absolute right-0 w-32 h-full bg-gradient-to-l from-page-bg-alt to-transparent z-10"></div>
          <div className="marquee-track flex gap-12 items-center w-max text-text-muted/60 font-semibold text-xl">
            {/* Doubled for seamless loop */}
            {[1, 2].map((i) => (
              <React.Fragment key={i}>
                <div className="flex items-center gap-2"><TerminalSquare size={24}/> Cursor</div>
                <div className="flex items-center gap-2"><Command size={24}/> Claude Desktop</div>
                <div className="flex items-center gap-2"><Settings size={24}/> Windsurf</div>
                <div className="flex items-center gap-2"><Laptop size={24}/> Local Agents</div>
                <div className="flex items-center gap-2"><TerminalSquare size={24}/> Cursor</div>
                <div className="flex items-center gap-2"><Command size={24}/> Claude Desktop</div>
                <div className="flex items-center gap-2"><Settings size={24}/> Windsurf</div>
                <div className="flex items-center gap-2"><Laptop size={24}/> Local Agents</div>
              </React.Fragment>
            ))}
          </div>
        </div>


      </section>

      {/* 6. FEATURE: FILE SHARING */}
      <section id="workspace" className="feature-section py-24 px-6 max-w-6xl mx-auto flex flex-col md:flex-row items-center gap-16">
        <div className="feature-text flex-1 text-left">
          <div className="text-[13px] font-semibold uppercase tracking-wider text-accent mb-3">03 / Workspace</div>
          <h2 className="text-3xl md:text-4xl font-semibold text-text-primary mb-4 leading-tight">
            Move things instantly.
          </h2>
          <p className="text-lg text-text-muted">
            Drag a file onto the mirrored screen to send it across—no cables, no emailing yourself. Plus, capture full-resolution screenshots straight to your desktop with a single click.
          </p>
        </div>

      </section>

      {/* 7. CTA BAND */}
      <section className="bg-page-bg-alt py-24 border-t border-border">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h2 className="text-3xl md:text-4xl font-semibold text-text-primary mb-8">
            Your Android, fully at your desk's command.
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a href="https://github.com/ganeshmshetty/mirin/releases/latest" target="_blank" rel="noopener noreferrer" className="bg-accent hover:bg-accent/90 text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2.5 w-full sm:w-auto justify-center">
              <AppleIcon className="w-5 h-5" /> Download for macOS
            </a>
            <a href="https://github.com/ganeshmshetty/mirin/releases/latest" target="_blank" rel="noopener noreferrer" className="bg-page-bg border border-border hover:bg-page-bg-alt text-text-primary px-6 py-3 rounded-lg font-medium transition-colors flex items-center gap-2.5 w-full sm:w-auto justify-center">
              <WindowsIcon className="w-5 h-5" /> Download for Windows
            </a>
          </div>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="py-12 px-6 max-w-6xl mx-auto border-t border-border flex flex-col md:flex-row justify-between items-center gap-6">
        <div className="flex items-center gap-2">
          <img src="/brand/icon-svg/full-lockup/Light-transparent.svg" alt="Mirin" className="h-6 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity dark:hidden" />
          <img src="/brand/icon-svg/full-lockup/Dark-transparent.svg" alt="Mirin" className="h-6 w-auto object-contain opacity-70 hover:opacity-100 transition-opacity hidden dark:block" />
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
