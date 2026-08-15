import { invoke } from "@tauri-apps/api/core";

/**
 * Payload sent over Tauri IPC when a popout mirror window closes.
 */
export interface MirrorWindowClosedPayload {
  deviceId: string;
}

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

  /**
   * Open embedded screen mirroring in its own dedicated standalone Tauri window
   */
  async openMirrorWindow(deviceId: string, deviceName: string): Promise<void> {
    await invoke("open_mirror_window", { deviceId, deviceName });
  },

  /**
   * Close the popout mirror window for a specific device and clean up its stream
   */
  async closeMirrorWindow(deviceId: string): Promise<void> {
    await invoke("close_mirror_window", { deviceId });
  },

  /**
   * Focus and unminimize the popout mirror window for a specific device
   */
  async focusMirrorWindow(deviceId: string): Promise<void> {
    await invoke("focus_mirror_window", { deviceId });
  },

  /**
   * Focus and unminimize the main application window
   */
  async focusMainWindow(): Promise<void> {
    await invoke("focus_main_window");
  },

  /**
   * Check whether a popout mirror window is currently open for a specific device
   */
  async isMirrorWindowOpen(deviceId: string): Promise<boolean> {
    return await invoke<boolean>("is_mirror_window_open", { deviceId });
  },

  /**
   * Listen for popout mirror window close events.
   * Returns an unlisten function.
   */
  async onMirrorWindowClosed(
    callback: (payload: MirrorWindowClosedPayload) => void,
  ): Promise<() => void> {
    const { listen } = await import("@tauri-apps/api/event");
    return await listen<MirrorWindowClosedPayload>(
      "mirror-window-closed",
      (event) => {
        if (event.payload?.deviceId) {
          callback(event.payload);
        }
      },
    );
  },

  /**
   * Deterministically derive Tauri window label from device ID.
   * Mirrors Rust `device_id_to_window_label`.
   */
  sanitizeWindowLabel(deviceId: string): string {
    const bytes = new TextEncoder().encode(deviceId);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
      hex += bytes[i].toString(16).padStart(2, "0");
    }
    return `mirror_${hex}`;
  },
};

