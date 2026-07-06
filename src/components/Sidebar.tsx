import logo from "../assets/logo.svg"; // Import logo
import { Home, Settings, Smartphone, Plus, Github } from "lucide-react";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";

interface NavItem {
    id: string;
    label: string;
    icon: typeof Home; // Type alias for LucideIcon
}

const navItems: NavItem[] = [
    { id: "home", label: "Devices", icon: Smartphone },
    { id: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
    activeTab: string;
    onTabChange: (tab: string) => void;
    onConnectClick?: () => void;
}

export function Sidebar({ activeTab, onTabChange, onConnectClick }: SidebarProps) {
    const [appVersion, setAppVersion] = useState<string>("");

    useEffect(() => {
        getVersion().then((v) => setAppVersion(v));
    }, []);

    return (
        <aside className="w-64 bg-slate-50 dark:bg-[#16191b] border-r border-gray-200 dark:border-[#222629] flex flex-col flex-shrink-0 transition-colors">
            {/* Logo */}
            <div className="h-14 flex items-center px-6 gap-3">
                <img
                    src={logo}
                    alt="Mirin"
                    className="w-8 h-8 object-contain"
                />
                <span className="font-semibold text-gray-800 dark:text-white tracking-tight">Mirin</span>
            </div>

            {/* Primary Action */}
            <div className="px-4 mb-2">
                <button
                    onClick={onConnectClick}
                    className="w-full h-9 flex items-center justify-center gap-2 bg-cyan-600 text-white rounded-lg text-sm font-medium hover:bg-cyan-700 transition-all shadow-sm active:scale-[0.98]"
                    title="Start Mirroring"
                >
                    <Plus size={16} />
                    <span>Start Mirroring</span>
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-4 px-2 space-y-2">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            className="w-full flex items-center gap-4 pl-6 pr-4 py-1.5 text-sm font-medium rounded-lg transition-all text-gray-600 dark:text-slate-400 hover:bg-gray-200/50 dark:hover:bg-[#1d2327]/50 hover:text-gray-950 dark:hover:text-slate-100 outline-none"
                        >
                            <div className={`px-3 py-1.5 rounded-lg transition-all flex items-center justify-center ${
                                isActive 
                                    ? "bg-app-active text-app-active-text shadow-sm ring-1 ring-cyan-200/40 dark:ring-[#22d3ee]/20" 
                                    : "text-gray-400 dark:text-slate-500"
                            }`}>
                                <Icon size={18} />
                            </div>
                            <span className={isActive ? "text-gray-800 dark:text-slate-200 font-semibold" : ""}>
                                {item.label}
                            </span>
                        </button>
                    );
                })}
            </nav>

            {/* Footer / Version */}
            <div className="p-4 border-t border-gray-200/60 dark:border-[#222629]/60 flex items-center justify-center gap-3">
                <a
                    href="https://github.com/ganeshmshetty/mirin"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-[#22d3ee] transition-colors"
                    title="GitHub Repository"
                >
                    <Github size={16} />
                </a>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-[#2f353a]" />
                <p className="text-xs text-gray-400 dark:text-slate-500 text-center font-mono">
                    {appVersion ? `v${appVersion}` : "..."}
                </p>
            </div>
        </aside>
    );
}
