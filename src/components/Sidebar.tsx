import logo from "../assets/logo.svg";
import {
  Settings,
  Smartphone,
  Home,
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
import { useTranslation } from "react-i18next";

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
  deviceRail,
  activeTool = "screen",
  onToolChange,
}: SidebarProps) {
  const { t } = useTranslation();
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
        <img
          src={logo}
          alt="Mirin"
          className="w-8 h-8 object-contain flex-shrink-0"
        />
      </div>

      {/* Top Navigation Action: Home icon when on home / Back icon when inside an individual device or settings */}
      <div className="mb-2 flex-shrink-0 mt-2 flex justify-center">
        {showBack ? (
          <button
            onClick={() => navigate(-1)}
            title="Back"
            className="flex items-center justify-center h-10 w-10 rounded-xl transition-all outline-none text-gray-600 dark:text-slate-400 hover:bg-gray-200/50 dark:hover:bg-[#1d2327] hover:text-gray-900 dark:hover:text-slate-100"
          >
            <ArrowLeft size={20} />
          </button>
        ) : (
          <button
            onClick={() => navigate("/")}
            title={t("sidebar.home")}
            className={`flex items-center justify-center h-10 w-10 rounded-xl transition-all outline-none ${
              isHome
                ? "bg-cyan-500/15 text-cyan-700 dark:text-cyan-400"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-200/50 dark:hover:bg-[#1d2327] hover:text-gray-900 dark:hover:text-slate-100"
            }`}
          >
            <Home size={20} />
          </button>
        )}
      </div>

      {/* Primary Nav */}
      <nav className="flex-1 py-2 px-1.5 space-y-1.5 overflow-y-auto overflow-x-hidden flex flex-col items-center">
        {isDeviceMode && (
          <div className="flex flex-col items-center space-y-1.5 w-[40px]">
            {deviceTools.map((tool) => {
              const Icon = tool.icon;
              const isActive = activeTool === tool.id;
              return (
                <button
                  key={tool.id}
                  onClick={() => onToolChange?.(tool.id)}
                  title={t("sidebar." + tool.id)}
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
          title={t("sidebar.settings")}
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
