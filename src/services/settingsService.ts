import { invoke } from '@tauri-apps/api/core';
import { Settings, DEFAULT_SETTINGS } from '../types';

export const settingsService = {
  async saveSettings(settings: Settings): Promise<boolean> {
    try {
      const result = await invoke<boolean>('save_settings', { settings });
      return result;
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw error;
    }
  },

  async loadSettings(): Promise<Settings> {
    try {
      const settings = await invoke<Settings>('load_settings');
      return settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      // Return default settings if loading fails
      return DEFAULT_SETTINGS;
    }
  },

  async clearAppCache(): Promise<string> {
    return await invoke<string>('clear_app_cache');
  },
};
