import { invoke } from "@tauri-apps/api/core";

/**
 * Service for Tauri window management operations
 */
export const windowService = {
  /**
   * Open the connection manager window (optionally in quick-mirror mode)
   */
  async openConnectWindow(mode?: "quick-mirror" | string): Promise<void> {
    await invoke("open_connect_window", { mode });
  },

  /**
   * Close the current active window
   */
  async closeCurrentWindow(): Promise<void> {
    await invoke("close_current_window");
  },
};
