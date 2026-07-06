import { useState, useEffect, useRef } from 'react';
import { Settings, DEFAULT_SETTINGS } from '../types';
import { settingsService } from '../services';
import { useTheme } from './ThemeProvider';
import { HelpCircle, ChevronDown, Monitor, Sliders } from 'lucide-react';

interface SettingsPanelProps {
  onSettingsChange?: (settings: Settings) => void;
}

// 1. Reusable Toggle Switch Component
function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`w-10 h-6 flex items-center rounded-full p-1 transition-colors duration-200 outline-none ${
        checked ? "bg-cyan-500" : "bg-gray-300 dark:bg-[#252b30]"
      }`}
    >
      <div
        className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform duration-200 ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

// 2. Reusable Themed Custom Select Component
interface SelectOption {
  value: string;
  label: string;
}

interface CustomSelectProps {
  value: string;
  options: SelectOption[];
  onChange: (value: any) => void;
}

function CustomSelect({ value, options, onChange }: CustomSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className="relative w-48 text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3 py-1.5 border border-gray-300 dark:border-app-border rounded-lg shadow-sm bg-white dark:bg-app-input text-gray-900 dark:text-app-text text-sm hover:border-gray-400 dark:hover:border-[#2f353a] transition-all outline-none"
      >
        <span className="truncate">{selectedOption ? selectedOption.label : value}</span>
        <ChevronDown size={14} className={`text-gray-400 dark:text-slate-500 transition-transform duration-200 shrink-0 ml-1 ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-full dropdown-menu z-50 animate-scale-in origin-top-right">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`dropdown-item ${opt.value === value ? 'bg-cyan-50/50 dark:bg-[#1a262b] text-cyan-600 dark:text-[#22d3ee] font-semibold' : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// 3. Reusable Hover-to-Reveal Info Tooltip Component
function InfoTooltip({ content }: { content: string }) {
  return (
    <div className="group relative inline-block ml-1.5 align-middle cursor-help">
      <HelpCircle size={14} className="text-gray-400 dark:text-slate-500 hover:text-gray-600 dark:hover:text-slate-300 transition-colors" />
      <div className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-900 dark:bg-slate-800 text-white dark:text-slate-200 text-xs rounded-lg shadow-lg opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-center font-normal z-50 border dark:border-app-border leading-relaxed">
        {content}
        <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900 dark:border-t-slate-800" />
      </div>
    </div>
  );
}

type TabType = 'interface' | 'performance';

export function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabType>('interface');
  const { setTheme } = useTheme();

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
      console.error('Failed to load settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateSetting = async <K extends keyof Settings>(key: K, value: Settings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    try {
      await settingsService.saveSettings(updated);
      if (key === 'theme') {
        setTheme(value as any);
      }
      onSettingsChange?.(updated);
    } catch (error) {
      console.error('Failed to auto-save setting:', error);
    }
  };

  const resetToDefaults = async () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      await settingsService.saveSettings(DEFAULT_SETTINGS);
      setTheme(DEFAULT_SETTINGS.theme);
      onSettingsChange?.(DEFAULT_SETTINGS);
    } catch (error) {
      console.error('Failed to save default settings:', error);
    }
  };

  if (loading) {
    return (
      <div className="card flex items-center justify-center p-12">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-primary-600 border-t-transparent mb-3"></div>
          <div className="text-gray-500 dark:text-app-muted font-medium">Loading settings...</div>
        </div>
      </div>
    );
  }

  return (
    <div className="card p-6 max-w-2xl mx-auto">
      {/* Tabs Selector */}
      <div className="flex bg-gray-100 dark:bg-app-input p-1 rounded-xl mb-6">
        <button
          type="button"
          onClick={() => setActiveTab('interface')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all outline-none ${
            activeTab === 'interface'
              ? 'bg-white dark:bg-app-card text-cyan-600 dark:text-[#22d3ee] shadow-sm font-semibold'
              : 'text-gray-600 dark:text-app-muted hover:text-gray-900 dark:hover:text-app-text'
          }`}
        >
          <Monitor size={15} />
          Interface & Theme
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('performance')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all outline-none ${
            activeTab === 'performance'
              ? 'bg-white dark:bg-app-card text-cyan-600 dark:text-[#22d3ee] shadow-sm font-semibold'
              : 'text-gray-600 dark:text-app-muted hover:text-gray-900 dark:hover:text-app-text'
          }`}
        >
          <Sliders size={15} />
          Quality & Performance
        </button>
      </div>

      {/* Settings Options container */}
      <div className="divide-y divide-gray-100 dark:divide-app-border">
        {/* INTERFACE TAB ITEMS */}
        {activeTab === 'interface' && (
          <div className="space-y-1">
            {/* Theme selection row */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-app-text">Theme</span>
                <InfoTooltip content="Choose the application appearance" />
              </div>
              <CustomSelect
                value={settings.theme}
                options={[
                  { value: 'system', label: 'System Default' },
                  { value: 'light', label: 'Light Mode' },
                  { value: 'dark', label: 'Dark Mode' }
                ]}
                onChange={(val) => updateSetting('theme', val)}
              />
            </div>

            {/* Always on top row */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-app-text">Always on Top</span>
                <InfoTooltip content="Keep mirror window above other windows" />
              </div>
              <ToggleSwitch
                checked={settings.alwaysOnTop}
                onChange={(checked) => updateSetting('alwaysOnTop', checked)}
              />
            </div>

            {/* Stay Awake row */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-app-text">Stay Awake</span>
                <InfoTooltip content="Prevent device from sleeping during mirroring" />
              </div>
              <ToggleSwitch
                checked={settings.stayAwake}
                onChange={(checked) => updateSetting('stayAwake', checked)}
              />
            </div>
          </div>
        )}

        {/* QUALITY & PERFORMANCE TAB ITEMS */}
        {activeTab === 'performance' && (
          <div className="space-y-1">
            {/* Resolution row */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-app-text">Resolution</span>
                <InfoTooltip content="Lower resolution can improve performance on slower networks" />
              </div>
              <CustomSelect
                value={settings.resolution}
                options={[
                  { value: 'default', label: 'Default (Device Native)' },
                  { value: '1920', label: '1920 (1080p)' },
                  { value: '1280', label: '1280 (720p)' },
                  { value: '800', label: '800 (Lower Quality)' }
                ]}
                onChange={(val) => updateSetting('resolution', val)}
              />
            </div>

            {/* Bitrate row */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-app-text">Bitrate</span>
                <InfoTooltip content="Higher bitrate provides better quality but requires more bandwidth" />
              </div>
              <div className="flex items-center gap-3 w-72">
                <input
                  type="range"
                  min="1000000"
                  max="20000000"
                  step="1000000"
                  value={settings.bitrate}
                  onChange={(e) => updateSetting('bitrate', parseInt(e.target.value))}
                  className="flex-1 h-1 bg-gray-200 dark:bg-app-border rounded-lg appearance-none cursor-default accent-cyan-600"
                />
                <span className="text-xs font-semibold text-cyan-600 dark:text-[#22d3ee] w-16 text-right font-mono">
                  {(settings.bitrate / 1000000).toFixed(1)} Mbps
                </span>
              </div>
            </div>

            {/* Max FPS row */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-app-text">Max FPS</span>
                <InfoTooltip content="Lower FPS can reduce CPU usage and network bandwidth" />
              </div>
              <div className="flex items-center gap-3 w-72">
                <input
                  type="range"
                  min="15"
                  max="120"
                  step="5"
                  value={settings.maxFps}
                  onChange={(e) => updateSetting('maxFps', parseInt(e.target.value))}
                  className="flex-1 h-1 bg-gray-200 dark:bg-app-border rounded-lg appearance-none cursor-default accent-cyan-600"
                />
                <span className="text-xs font-semibold text-cyan-600 dark:text-[#22d3ee] w-16 text-right font-mono">
                  {settings.maxFps} FPS
                </span>
              </div>
            </div>

            {/* Turn screen off row */}
            <div className="flex items-center justify-between py-4">
              <div className="flex items-center">
                <span className="text-sm font-semibold text-gray-900 dark:text-app-text">Turn Screen Off</span>
                <InfoTooltip content="Turn off device screen while mirroring to save battery" />
              </div>
              <ToggleSwitch
                checked={settings.turnScreenOff}
                onChange={(checked) => updateSetting('turnScreenOff', checked)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex gap-3 pt-6 border-t border-gray-100 dark:border-app-border mt-6 justify-end">
        <button
          type="button"
          onClick={resetToDefaults}
          className="btn-ghost"
        >
          <svg className="w-4 h-4 inline mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Reset to Defaults
        </button>
      </div>
    </div>
  );
}
