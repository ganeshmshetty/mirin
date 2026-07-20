import { invoke } from "@tauri-apps/api/core";

/**
 * Service for Tauri window management operations
 */
export const windowService = {
  /**
   * Close the current active window
   */
  async closeCurrentWindow(): Promise<void> {
    await invoke("close_current_window");
  },
};
