import logo from "../assets/logo.png"; // Import logo
import { Home, Settings, Smartphone, Plus } from "lucide-react";
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
}

export function Sidebar({ activeTab, onTabChange }: SidebarProps) {
    const [appVersion, setAppVersion] = useState<string>("");

    useEffect(() => {
        getVersion().then((v) => setAppVersion(v));
    }, []);

    return (
        <aside className="w-64 bg-gray-50/50 border-r border-gray-200 flex flex-col flex-shrink-0">
            {/* Logo */}
            <div className="h-14 flex items-center px-6 gap-3">
                <img
                    src={logo}
                    alt="Mirin"
                    className="w-8 h-8 rounded-lg shadow-sm object-cover"
                />
                <span className="font-semibold text-gray-800 tracking-tight">Mirin</span>
            </div>

            {/* Primary Action */}
            <div className="px-4 mb-2">
                <button
                    disabled
                    className="w-full h-9 flex items-center justify-center gap-2 bg-gray-900 text-white rounded-lg text-sm font-medium opacity-50 cursor-not-allowed hover:opacity-100 transition-opacity"
                    title="Wireless Connection Wizard (Coming Soon)"
                >
                    <Plus size={16} />
                    <span>Connect Device</span>
                </button>
            </div>

            {/* Navigation */}
            <nav className="flex-1 py-2 px-2 space-y-0.5">
                {navItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = activeTab === item.id;

                    return (
                        <button
                            key={item.id}
                            onClick={() => onTabChange(item.id)}
                            className={`w-full flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-all ${isActive
                                ? "bg-white text-cyan-600 shadow-sm ring-1 ring-gray-200"
                                : "text-gray-600 hover:bg-gray-100/80 hover:text-gray-900"
                                }`}
                        >
                            <Icon size={18} className={isActive ? "text-cyan-500" : "text-gray-400"} />
                            {item.label}
                        </button>
                    );
                })}
            </nav>

            {/* Footer / Version */}
            <div className="p-4 border-t border-gray-100">
                <p className="text-xs text-gray-400 text-center font-mono">
                    {appVersion ? `v${appVersion}` : "..."}
                </p>
            </div>
        </aside>
    );
}
