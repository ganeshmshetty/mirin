import { useState, useEffect } from "react";
import { Settings, DEFAULT_SETTINGS } from "../types";
import { settingsService } from "../services";
import { useTheme } from "./ThemeProvider";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  Monitor,
  Sliders,
  ChevronRight,
  Settings as SettingsIcon,
  Terminal,
  RefreshCw,
} from "lucide-react";
import { useToast } from "./ToastProvider";
import { ToggleSwitch } from "./ui/ToggleSwitch";
import { CustomSelect } from "./ui/CustomSelect";

interface SettingsPanelProps {
  onSettingsChange?: (settings: Settings) => void;
}

type TabType = "general" | "interface" | "performance" | "mcp";

export function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>("general");
  const [clearingCache, setClearingCache] = useState(false);
  const { setTheme } = useTheme();
  const toast = useToast();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const loadedSettings = await settingsService.loadSettings();
      setSettings(loadedSettings);
      onSettingsChange?.(loadedSettings);
    } catch (error) {
      console.error("Failed to load settings:", error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async <K extends keyof Settings>(
    key: K,
    value: Settings[K],
  ) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await settingsService.saveSettings(updated);
      if (key === "theme") {
        setTheme(value as any);
      }
      if (key === "alwaysOnTop") {
        getCurrentWindow().setAlwaysOnTop(value as boolean);
      }
      onSettingsChange?.(updated);
    } catch (error) {
      console.error("Failed to auto-save setting:", error);
      toast.error("Failed to save setting");
    }
  };

  const resetToDefaults = async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await settingsService.saveSettings(DEFAULT_SETTINGS);
      setTheme(DEFAULT_SETTINGS.theme);
      getCurrentWindow().setAlwaysOnTop(DEFAULT_SETTINGS.alwaysOnTop);
      onSettingsChange?.(DEFAULT_SETTINGS);
      toast.success("Settings reset to defaults");
    } catch (error) {
      console.error("Failed to save default settings:", error);
      toast.error("Failed to reset settings");
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      const msg = await settingsService.clearAppCache();
      toast.success(msg || "Cache cleared");
    } catch (error) {
      console.error("Failed to clear cache:", error);
      toast.error(`Failed to clear cache: ${error}`);
    } finally {
      setClearingCache(false);
    }
  };

  const applyPreset = (preset: "performance" | "balanced" | "high_quality") => {
    let newSettings = { ...settings };
    if (preset === "performance") {
      newSettings.resolution = "800";
      newSettings.bitrate = 4000000;
      newSettings.maxFps = 30;
    } else if (preset === "balanced") {
      newSettings.resolution = "1280";
      newSettings.bitrate = 8000000;
      newSettings.maxFps = 60;
    } else if (preset === "high_quality") {
      newSettings.resolution = "default";
      newSettings.bitrate = 16000000;
      newSettings.maxFps = 60;
    }
    setSettings(newSettings);
    settingsService.saveSettings(newSettings).catch(console.error);
    onSettingsChange?.(newSettings);
  };

  const getPresetStatus = () => {
    if (
      settings.resolution === "800" &&
      settings.bitrate === 4000000 &&
      settings.maxFps === 30
    )
      return "performance";
    if (
      settings.resolution === "1280" &&
      settings.bitrate === 8000000 &&
      settings.maxFps === 60
    )
      return "balanced";
    if (
      settings.resolution === "default" &&
      settings.bitrate === 16000000 &&
      settings.maxFps === 60
    )
      return "high_quality";
    return "custom";
  };

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-cyan-500 border-t-transparent mb-3"></div>
          <div className="text-gray-500 dark:text-app-muted font-medium">
            Loading settings...
          </div>
        </div>
      </div>
    );
  }

  const renderSettingRow = (
    title: string,
    description: string,
    control: React.ReactNode,
    isLast: boolean = false,
  ) => (
    <div
      className={`flex items-center justify-between py-4 px-5 ${isLast ? "" : "border-b border-gray-100 dark:border-[#222629]/50"}`}
    >
      <div className="flex flex-col pr-8">
        <span className="text-[14px] font-medium text-gray-900 dark:text-slate-100">
          {title}
        </span>
        <span className="text-[13px] text-gray-500 dark:text-slate-400 mt-0.5 leading-snug">
          {description}
        </span>
      </div>
      <div className="flex-shrink-0">{control}</div>
    </div>
  );

  return (
    <div className="flex h-full w-full bg-white dark:bg-[#0e1012] overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 flex-shrink-0 bg-slate-50 dark:bg-[#16191b] border-r border-gray-200/50 dark:border-[#222629]/50 pt-16 pb-6 flex flex-col">
        <div className="px-6 pb-2 mb-2">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-slate-100 mb-6">
            Settings
          </h2>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
            Preferences
          </h3>
        </div>
        <div className="flex flex-col gap-1 px-4 flex-1">
          <button
            type="button"
            onClick={() => setActiveTab("general")}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors outline-none ${
              activeTab === "general"
                ? "bg-gray-200/50 dark:bg-[#1d2327] text-cyan-600 dark:text-cyan-400"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#1a1d20] hover:text-gray-900 dark:hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <SettingsIcon size={16} />
              General
            </div>
            {activeTab === "general" && (
              <ChevronRight size={16} className="opacity-50" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("interface")}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors outline-none ${
              activeTab === "interface"
                ? "bg-gray-200/50 dark:bg-[#1d2327] text-cyan-600 dark:text-cyan-400"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#1a1d20] hover:text-gray-900 dark:hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <Monitor size={16} />
              Interface & Theme
            </div>
            {activeTab === "interface" && (
              <ChevronRight size={16} className="opacity-50" />
            )}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("performance")}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors outline-none ${
              activeTab === "performance"
                ? "bg-gray-200/50 dark:bg-[#1d2327] text-cyan-600 dark:text-cyan-400"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#1a1d20] hover:text-gray-900 dark:hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <Sliders size={16} />
              Quality & Performance
            </div>
            {activeTab === "performance" && (
              <ChevronRight size={16} className="opacity-50" />
            )}
          </button>

          <div className="mt-4 mb-1">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              Advanced
            </h3>
          </div>
          <button
            type="button"
            onClick={() => setActiveTab("mcp")}
            className={`w-full flex items-center justify-between px-3 py-2 text-sm font-medium rounded-lg transition-colors outline-none ${
              activeTab === "mcp"
                ? "bg-gray-200/50 dark:bg-[#1d2327] text-cyan-600 dark:text-cyan-400"
                : "text-gray-600 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#1a1d20] hover:text-gray-900 dark:hover:text-slate-200"
            }`}
          >
            <div className="flex items-center gap-3">
              <Terminal size={16} />
              MCP Server
            </div>
            {activeTab === "mcp" && (
              <ChevronRight size={16} className="opacity-50" />
            )}
          </button>
        </div>

        <div className="px-4 py-3 mt-auto border-t border-gray-200/50 dark:border-[#222629]/50">
          <p className="text-[11px] text-gray-400 dark:text-slate-500">
            Changes are saved automatically.
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0e1012] flex flex-col relative">
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#0e1012]/80 backdrop-blur-md px-8 py-6 border-b border-gray-200/50 dark:border-[#222629]/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
              {activeTab === "general" && "General"}
              {activeTab === "interface" && "Interface & Theme"}
              {activeTab === "performance" && "Quality & Performance"}
              {activeTab === "mcp" && "MCP Server"}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {activeTab === "general" &&
                "Window behavior, device power, and local cache."}
              {activeTab === "interface" &&
                "Customize the application appearance."}
              {activeTab === "performance" &&
                "Adjust streaming quality and resource usage."}
              {activeTab === "mcp" &&
                "Configure the Model Context Protocol server for AI integration."}
            </p>
          </div>
          <button
            type="button"
            onClick={resetToDefaults}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-200/50 dark:border-[#222629]/50 text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-[#16191b] transition-colors shadow-sm"
          >
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Reset
          </button>
        </div>

        <div className="p-8 max-w-3xl">
          {/* GENERAL — window/device behavior + cache (no theme; that lives under Interface) */}
          {activeTab === "general" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Window & Device
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    "Always on Top",
                    "Keep the Mirin window above all other windows on your screen.",
                    <ToggleSwitch
                      checked={settings.alwaysOnTop}
                      onChange={(checked) =>
                        updateSetting("alwaysOnTop", checked)
                      }
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    "Stay Awake",
                    "Prevent the device from sleeping automatically while mirroring is active.",
                    <ToggleSwitch
                      checked={settings.stayAwake}
                      onChange={(checked) =>
                        updateSetting("stayAwake", checked)
                      }
                    />,
                    true,
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Data & Storage
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    "Clear App Cache",
                    "Remove temporary cache folders under the app data directory. Settings and saved devices are kept.",
                    <button
                      type="button"
                      disabled={clearingCache}
                      onClick={handleClearCache}
                      className="px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                      {clearingCache ? "Clearing…" : "Clear Cache"}
                    </button>,
                    true,
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-gray-200 dark:border-[#2a3036] px-5 py-4">
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  Coming soon
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 leading-relaxed">
                  Launch on system startup and automatic update checks need
                  extra platform plugins and will ship in a later release.
                </p>
              </div>
            </div>
          )}

          {/* INTERFACE — appearance only */}
          {activeTab === "interface" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Appearance
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    "Theme",
                    "Choose the application appearance.",
                    <CustomSelect
                      value={settings.theme}
                      options={[
                        { value: "system", label: "System Default" },
                        { value: "light", label: "Light Mode" },
                        { value: "dark", label: "Dark Mode" },
                      ]}
                      onChange={(val) => updateSetting("theme", val as any)}
                    />,
                    true,
                  )}
                </div>
              </div>
            </div>
          )}

          {/* QUALITY & PERFORMANCE TAB ITEMS */}
          {activeTab === "performance" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Presets
                </h4>
                <div className="flex bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 p-1 rounded-xl shadow-sm">
                  <button
                    onClick={() => applyPreset("performance")}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all outline-none ${
                      getPresetStatus() === "performance"
                        ? "bg-white dark:bg-[#222629] text-cyan-600 dark:text-cyan-400 shadow-sm"
                        : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Performance
                  </button>
                  <button
                    onClick={() => applyPreset("balanced")}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all outline-none ${
                      getPresetStatus() === "balanced"
                        ? "bg-white dark:bg-[#222629] text-cyan-600 dark:text-cyan-400 shadow-sm"
                        : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
                    }`}
                  >
                    Balanced
                  </button>
                  <button
                    onClick={() => applyPreset("high_quality")}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all outline-none ${
                      getPresetStatus() === "high_quality"
                        ? "bg-white dark:bg-[#222629] text-cyan-600 dark:text-cyan-400 shadow-sm"
                        : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
                    }`}
                  >
                    High Quality
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Streaming Quality
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    "Resolution",
                    "Lower resolution can improve performance and reduce latency on slower network connections.",
                    <CustomSelect
                      value={settings.resolution}
                      options={[
                        { value: "default", label: "Default (Native)" },
                        { value: "1920", label: "1080p" },
                        { value: "1280", label: "720p" },
                        { value: "800", label: "Lower Quality" },
                      ]}
                      onChange={(val) => updateSetting("resolution", val)}
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    "Bitrate",
                    "Higher bitrate provides a clearer image but requires significantly more bandwidth.",
                    <div className="flex items-center gap-3 w-56">
                      <input
                        type="range"
                        min="1000000"
                        max="20000000"
                        step="1000000"
                        value={settings.bitrate}
                        onChange={(e) =>
                          updateSetting("bitrate", parseInt(e.target.value))
                        }
                        className="flex-1 h-1.5 bg-gray-200 dark:bg-[#222629] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <span className="text-[13px] font-medium text-cyan-600 dark:text-cyan-400 w-16 text-right font-mono">
                        {(settings.bitrate / 1000000).toFixed(1)} Mbps
                      </span>
                    </div>,
                    false,
                  )}
                  {renderSettingRow(
                    "Max FPS",
                    "Lowering the frame rate can reduce both CPU usage on your computer and network bandwidth.",
                    <div className="flex items-center gap-3 w-56">
                      <input
                        type="range"
                        min="15"
                        max="120"
                        step="5"
                        value={settings.maxFps}
                        onChange={(e) =>
                          updateSetting("maxFps", parseInt(e.target.value))
                        }
                        className="flex-1 h-1.5 bg-gray-200 dark:bg-[#222629] rounded-lg appearance-none cursor-pointer accent-cyan-500"
                      />
                      <span className="text-[13px] font-medium text-cyan-600 dark:text-cyan-400 w-16 text-right font-mono">
                        {settings.maxFps} FPS
                      </span>
                    </div>,
                    true,
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Power Saving
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    "Turn Screen Off",
                    "Automatically turn off the physical device screen while mirroring to save battery.",
                    <ToggleSwitch
                      checked={settings.turnScreenOff}
                      onChange={(checked) =>
                        updateSetting("turnScreenOff", checked)
                      }
                    />,
                    true,
                  )}
                </div>
              </div>
            </div>
          )}

          {/* MCP TAB ITEMS */}
          {activeTab === "mcp" && (
            <div className="space-y-6 animate-fade-in">
              <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl p-4 flex gap-3 items-start">
                <Terminal
                  className="text-gray-500 dark:text-slate-400 mt-0.5 flex-shrink-0"
                  size={18}
                />
                <div>
                  <h5 className="text-sm font-semibold text-gray-900 dark:text-slate-100">
                    Model Context Protocol
                  </h5>
                  <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                    The MCP server allows external AI agents and workflows to
                    securely interact with your connected Android devices. When
                    enabled, agents can request screenshots, send touches, and
                    execute shell commands programmatically.
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Server Status
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    "Enable MCP Server",
                    "Allow local network tools and agents to connect to Mirin.",
                    <ToggleSwitch
                      checked={settings.mcpEnabled}
                      onChange={(val) => updateSetting("mcpEnabled", val)}
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    "Port Configuration",
                    "The local port the MCP server will listen on.",
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        value={settings.mcpPort}
                        onChange={(e) => {
                          const raw = parseInt(e.target.value, 10);
                          if (Number.isNaN(raw)) {
                            updateSetting("mcpPort", 48484);
                            return;
                          }
                          // Valid TCP port range
                          updateSetting(
                            "mcpPort",
                            Math.min(65535, Math.max(1, raw)),
                          );
                        }}
                        className="w-20 px-2 py-1.5 text-sm bg-white dark:bg-[#0e1012] border border-gray-200/50 dark:border-[#222629]/50 rounded-lg text-gray-900 dark:text-slate-200 outline-none focus:border-cyan-500"
                      />
                      <button
                        className="p-1.5 text-gray-400 hover:text-cyan-500 transition-colors"
                        title="Restart Server"
                      >
                        <RefreshCw size={16} />
                      </button>
                    </div>,
                    true,
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  Security & Logs
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    "Require Authentication",
                    "Only allow clients with an API key to connect to the MCP server.",
                    <ToggleSwitch
                      checked={settings.mcpRequireAuth}
                      onChange={(val) => updateSetting("mcpRequireAuth", val)}
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    "Logging Level",
                    "Determine how much information the MCP server outputs to the logs.",
                    <select
                      value={settings.mcpLogLevel}
                      onChange={(e) =>
                        updateSetting("mcpLogLevel", e.target.value as any)
                      }
                      className="px-3 py-1.5 text-sm bg-white dark:bg-[#0e1012] border border-gray-200/50 dark:border-[#222629]/50 rounded-lg text-gray-900 dark:text-slate-200 outline-none cursor-pointer"
                    >
                      <option value="error">Errors Only</option>
                      <option value="info">Info</option>
                      <option value="debug">Debug (Verbose)</option>
                    </select>,
                    true,
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
