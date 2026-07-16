import logo from "../assets/logo.svg";
import {
  Settings,
  Smartphone,
  Plus,
  Github,
  ArrowLeft,
  Package,
  Terminal,
  type LucideIcon,
  Folder,
} from "lucide-react";
import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useNavigate, useLocation } from "react-router-dom";

export interface DeviceRailInfo {
  id: string;
  name: string;
  model?: string;
  isConnected: boolean;
}

interface SidebarProps {
  onConnectClick?: () => void;
  deviceRail?: DeviceRailInfo | null;
  activeTool?: string;
  onToolChange?: (tool: string) => void;
}

const deviceTools: { id: string; label: string; icon: LucideIcon }[] = [
  { id: "screen", label: "Live / Overview", icon: Smartphone },
  { id: "apps", label: "Apps", icon: Package },
  { id: "files", label: "Files", icon: Folder },
  { id: "console", label: "Console", icon: Terminal },
];

export function Sidebar({
  onConnectClick,
  deviceRail,
  activeTool = "screen",
  onToolChange,
}: SidebarProps) {
  const [appVersion, setAppVersion] = useState<string>("");
  const navigate = useNavigate();
  const location = useLocation();

  const isDeviceMode = Boolean(deviceRail);
  const isSettings = location.pathname === "/settings";
  const isHome = location.pathname === "/";

  useEffect(() => {
    getVersion().then((v) => setAppVersion(v));
  }, []);

  const showBack = isDeviceMode || isSettings;

  return (
    <aside className="w-[72px] relative z-50 bg-slate-50 dark:bg-[#16191b] border-r border-gray-200 dark:border-[#222629] flex flex-col flex-shrink-0 transition-colors select-none">
      {/* Logo row */}
      <div className="h-14 flex items-center justify-center flex-shrink-0 pt-2 pb-1 relative">
        <img src={logo} alt="Mirin" className="w-8 h-8 object-contain flex-shrink-0" />
        
        {/* Floating Back Button (outside sidebar) */}
        {showBack && (
          <button
            onClick={() => navigate(-1)}
            className="absolute left-full ml-4 w-8 h-8 flex items-center justify-center bg-white dark:bg-[#1d2327] text-gray-700 dark:text-slate-200 rounded-lg hover:bg-gray-100 dark:hover:bg-[#252c31] transition-all shadow-sm border border-gray-200 dark:border-[#222629] z-50"
            title="Back"
          >
            <ArrowLeft size={16} />
          </button>
        )}
      </div>

      {/* Action Button: Add Device */}
      <div className="mb-2 flex-shrink-0 mt-2 flex justify-center relative z-[100]">
        <div className="relative w-10 h-10">
          <button
            onClick={onConnectClick}
            className="absolute top-0 left-0 flex items-center bg-cyan-600 text-white rounded-xl hover:bg-cyan-700 transition-all duration-300 shadow-sm active:scale-[0.98] h-10 w-10 hover:w-[130px] overflow-hidden group"
          >
            <div className="w-10 h-10 flex items-center justify-center flex-shrink-0">
              <Plus size={20} className="transition-transform group-hover:rotate-90 duration-300" />
            </div>
            <span className="whitespace-nowrap font-medium text-sm opacity-0 group-hover:opacity-100 transition-opacity duration-300 delay-75">
              Add Device
            </span>
          </button>
        </div>
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 py-2 px-1.5 space-y-1.5 overflow-y-auto overflow-x-hidden flex flex-col items-center">
        {!isDeviceMode ? (
          /* Devices Button (Home) */
          <button
            onClick={() => navigate("/")}
            title="Devices"
            className={`flex items-center justify-center h-10 w-10 rounded-xl transition-all outline-none ${
              isHome
                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-200/50 dark:hover:bg-[#1d2327] hover:text-gray-900 dark:hover:text-slate-100"
            }`}
          >
            <Smartphone size={20} />
          </button>
        ) : (
          /* Device Tools (Replaces Devices button) */
          <div className="flex flex-col items-center space-y-1.5 w-[40px]">
            {deviceTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => onToolChange?.(tool.id)}
                  title={tool.label}
                  className={`flex items-center justify-center h-10 w-10 rounded-xl transition-all outline-none ${
                    isActive
                      ? "bg-cyan-500/15 text-cyan-600 dark:text-cyan-400 ring-1 ring-cyan-500/30"
                      : "text-gray-500 dark:text-slate-400 hover:bg-gray-200/50 dark:hover:bg-[#1d2327] hover:text-gray-900 dark:hover:text-slate-100"
                  }`}
                >
                  <Icon size={18} />
                </button>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="border-t border-gray-200/60 dark:border-[#222629]/60 flex-shrink-0 p-2 flex flex-col items-center gap-2">
        <button
          onClick={() => navigate("/settings")}
          className={`transition-colors flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg outline-none ${
            isSettings
              ? "text-cyan-600 dark:text-cyan-400 bg-cyan-500/10"
              : "text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-[#22d3ee] hover:bg-gray-200/50 dark:hover:bg-[#1d2327]"
          }`}
          title="Settings"
        >
          <Settings size={18} />
        </button>

        <a
          href="https://github.com/ganeshmshetty/mirin"
          target="_blank"
          rel="noopener noreferrer"
          className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-[#22d3ee] transition-colors flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-lg hover:bg-gray-200/50 dark:hover:bg-[#1d2327]/50"
          title={`GitHub Repository\nVersion ${appVersion}`}
        >
          <Github size={18} />
        </a>
      </div>
    </aside>
  );
}
