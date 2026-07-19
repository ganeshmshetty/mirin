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
import { useTranslation } from "react-i18next";
import i18n from "../i18n";

interface SettingsPanelProps {
  onSettingsChange?: (settings: Settings) => void;
}

type TabType = "general" | "interface" | "performance" | "mcp";

export function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
  const { t } = useTranslation();
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
      toast.error(t("settings.save_failed"));
    }
  };

  const resetToDefaults = async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await settingsService.saveSettings(DEFAULT_SETTINGS);
      setTheme(DEFAULT_SETTINGS.theme);
      getCurrentWindow().setAlwaysOnTop(DEFAULT_SETTINGS.alwaysOnTop);
      onSettingsChange?.(DEFAULT_SETTINGS);
      toast.success(t("settings.reset_success"));
    } catch (error) {
      console.error("Failed to save default settings:", error);
      toast.error(t("settings.reset_failed"));
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    try {
      await settingsService.clearAppCache();
      toast.success(t("settings.general.cache_cleared"));
    } catch (error) {
      console.error("Failed to clear cache:", error);
      toast.error(`${t("settings.general.cache_clear_failed")}: ${error}`);
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
            {t("settings.title")}
          </h2>
          <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
            {t("settings.preferences")}
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
              {t("settings.tabs.general")}
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
              {t("settings.tabs.interface")}
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
              {t("settings.tabs.performance")}
            </div>
            {activeTab === "performance" && (
              <ChevronRight size={16} className="opacity-50" />
            )}
          </button>

          <div className="mt-4 mb-1">
            <h3 className="text-xs font-semibold text-gray-400 dark:text-slate-500 uppercase tracking-wider">
              {t("settings.preferences")}
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
              {t("settings.tabs.mcp")}
            </div>
            {activeTab === "mcp" && (
              <ChevronRight size={16} className="opacity-50" />
            )}
          </button>
        </div>

        <div className="px-4 py-3 mt-auto border-t border-gray-200/50 dark:border-[#222629]/50">
          <p className="text-[11px] text-gray-400 dark:text-slate-500">
            {t("settings.auto_save")}
          </p>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0e1012] flex flex-col relative">
        <div className="sticky top-0 z-10 bg-white/80 dark:bg-[#0e1012]/80 backdrop-blur-md px-8 py-6 border-b border-gray-200/50 dark:border-[#222629]/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-slate-100">
              {activeTab === "general" && t("settings.tabs.general")}
              {activeTab === "interface" && t("settings.tabs.interface")}
              {activeTab === "performance" && t("settings.tabs.performance")}
              {activeTab === "mcp" && t("settings.tabs.mcp")}
            </h2>
            <p className="text-sm text-gray-500 dark:text-slate-400 mt-1">
              {activeTab === "general" && t("settings.subtitles.general")}
              {activeTab === "interface" && t("settings.subtitles.interface")}
              {activeTab === "performance" &&
                t("settings.subtitles.performance")}
              {activeTab === "mcp" && t("settings.subtitles.mcp")}
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
            {t("settings.reset")}
          </button>
        </div>

        <div className="p-8 max-w-3xl">
          {/* GENERAL — window/device behavior + cache (no theme; that lives under Interface) */}
          {activeTab === "general" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  {t("settings.general.window_device")}
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    t("settings.general.always_on_top"),
                    t("settings.general.always_on_top_desc"),
                    <ToggleSwitch
                      checked={settings.alwaysOnTop}
                      onChange={(checked) =>
                        updateSetting("alwaysOnTop", checked)
                      }
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    t("settings.general.stay_awake"),
                    t("settings.general.stay_awake_desc"),
                    <ToggleSwitch
                      checked={settings.stayAwake}
                      onChange={(checked) =>
                        updateSetting("stayAwake", checked)
                      }
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    t("settings.general.language"),
                    t("settings.general.language_desc"),
                    <CustomSelect
                      value={settings.language}
                      options={[
                        { value: "en", label: "English (US)" },
                        { value: "es", label: "Español (ES)" },
                        { value: "zh", label: "中文 (ZH)" },
                      ]}
                      onChange={(val) => {
                        updateSetting("language", val as any);
                        i18n.changeLanguage(val);
                      }}
                    />,
                    true,
                  )}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  {t("settings.general.data_storage")}
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    t("settings.general.clear_cache"),
                    t("settings.general.clear_cache_desc"),
                    <button
                      type="button"
                      disabled={clearingCache}
                      onClick={handleClearCache}
                      className="px-3 py-1.5 text-xs font-medium border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/10 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/20 transition-colors disabled:opacity-50"
                    >
                      {clearingCache
                        ? t("settings.general.clearing")
                        : t("settings.general.clear_cache_btn")}
                    </button>,
                    true,
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-gray-200 dark:border-[#2a3036] px-5 py-4">
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  {t("settings.general.coming_soon")}
                </p>
                <p className="text-xs text-gray-500 dark:text-slate-500 mt-1 leading-relaxed">
                  {t("settings.general.coming_soon_desc")}
                </p>
              </div>
            </div>
          )}

          {/* INTERFACE — appearance only */}
          {activeTab === "interface" && (
            <div className="space-y-6 animate-fade-in">
              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  {t("settings.interface.appearance")}
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    t("settings.interface.theme"),
                    t("settings.interface.theme_desc"),
                    <CustomSelect
                      value={settings.theme}
                      options={[
                        {
                          value: "system",
                          label: t("settings.interface.theme_options.system"),
                        },
                        {
                          value: "light",
                          label: t("settings.interface.theme_options.light"),
                        },
                        {
                          value: "dark",
                          label: t("settings.interface.theme_options.dark"),
                        },
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
                  {t("settings.performance.presets")}
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
                    {t("settings.performance.preset_options.performance")}
                  </button>
                  <button
                    onClick={() => applyPreset("balanced")}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all outline-none ${
                      getPresetStatus() === "balanced"
                        ? "bg-white dark:bg-[#222629] text-cyan-600 dark:text-cyan-400 shadow-sm"
                        : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {t("settings.performance.preset_options.balanced")}
                  </button>
                  <button
                    onClick={() => applyPreset("high_quality")}
                    className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all outline-none ${
                      getPresetStatus() === "high_quality"
                        ? "bg-white dark:bg-[#222629] text-cyan-600 dark:text-cyan-400 shadow-sm"
                        : "text-gray-500 dark:text-slate-400 hover:text-gray-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {t("settings.performance.preset_options.high_quality")}
                  </button>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  {t("settings.performance.stream_settings")}
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    t("settings.performance.resolution"),
                    t("settings.performance.resolution_desc"),
                    <CustomSelect
                      value={settings.resolution}
                      options={[
                        {
                          value: "default",
                          label: t(
                            "settings.performance.resolution_options.default",
                          ),
                        },
                        { value: "1920", label: "1080p" },
                        { value: "1280", label: "720p" },
                        {
                          value: "800",
                          label: t(
                            "settings.performance.resolution_options.low",
                          ),
                        },
                      ]}
                      onChange={(val) => updateSetting("resolution", val)}
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    t("settings.performance.bitrate"),
                    t("settings.performance.bitrate_desc"),
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
                    t("settings.performance.max_fps"),
                    t("settings.performance.max_fps_desc"),
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
                  {t("settings.performance.device_state")}
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    t("settings.performance.turn_screen_off"),
                    t("settings.performance.turn_screen_off_desc"),
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
                    {t("settings.mcp.title")}
                  </h5>
                  <p className="text-[13px] text-gray-500 dark:text-slate-400 mt-1 leading-relaxed">
                    {t("settings.mcp.description")}
                  </p>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 dark:text-slate-100 mb-3">
                  {t("settings.mcp.server_status")}
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    t("settings.mcp.enable_server"),
                    t("settings.mcp.enable_server_desc"),
                    <ToggleSwitch
                      checked={settings.mcpEnabled}
                      onChange={(val) => updateSetting("mcpEnabled", val)}
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    t("settings.mcp.port_config"),
                    t("settings.mcp.port_config_desc"),
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
                        title={t("settings.mcp.restart_server")}
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
                  {t("settings.mcp.security_logs")}
                </h4>
                <div className="bg-slate-50 dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl shadow-sm">
                  {renderSettingRow(
                    t("settings.mcp.require_auth"),
                    t("settings.mcp.require_auth_desc"),
                    <ToggleSwitch
                      checked={settings.mcpRequireAuth}
                      onChange={(val) => updateSetting("mcpRequireAuth", val)}
                    />,
                    false,
                  )}
                  {renderSettingRow(
                    t("settings.mcp.logging_level"),
                    t("settings.mcp.logging_level_desc"),
                    <select
                      value={settings.mcpLogLevel}
                      onChange={(e) =>
                        updateSetting("mcpLogLevel", e.target.value as any)
                      }
                      className="px-3 py-1.5 text-sm bg-white dark:bg-[#0e1012] border border-gray-200/50 dark:border-[#222629]/50 rounded-lg text-gray-900 dark:text-slate-200 outline-none cursor-pointer"
                    >
                      <option value="error">
                        {t("settings.mcp.log_options.error")}
                      </option>
                      <option value="info">
                        {t("settings.mcp.log_options.info")}
                      </option>
                      <option value="debug">
                        {t("settings.mcp.log_options.debug")}
                      </option>
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
