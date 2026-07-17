import { invoke, Channel } from "@tauri-apps/api/core";
import type { FrameEvent, EmbeddedStreamSettings } from "../types/tauri-commands";

/**
 * Service for scrcpy-related operations
 */
export const scrcpyService = {
  /**
   * Open embedded screen mirroring in its own dedicated standalone Tauri window
   */
  async openMirrorWindow(deviceId: string, deviceName: string): Promise<void> {
    await invoke("open_mirror_window", { deviceId, deviceName });
  },

  /**
   * Check if scrcpy is available
   */
  async checkAvailable(): Promise<boolean> {
    return await invoke<boolean>("check_scrcpy_available");
  },

  /**
   * Get scrcpy version
   */
  async getVersion(): Promise<string> {
    return await invoke<string>("get_scrcpy_version");
  },

  /**
   * Test scrcpy execution (gets version to verify it works)
   */
  async testExecution(): Promise<string> {
    return await invoke<string>("test_scrcpy_execution");
  },

  /**
   * Connect embedded WebCodecs mirroring stream
   */
  async connectEmbeddedMirror(
    deviceId: string,
    onFrame: Channel<FrameEvent>,
    settings?: Partial<EmbeddedStreamSettings>
  ): Promise<[number, number]> {
    return await invoke<[number, number]>("connect_embedded_mirror", {
      deviceId,
      onFrame,
      settings,
    });
  },

  /**
   * Disconnect embedded WebCodecs mirroring stream
   */
  async disconnectEmbeddedMirror(deviceId: string): Promise<void> {
    return await invoke("disconnect_embedded_mirror", { deviceId });
  },

  /** Lock the Android display to portrait or landscape. */
  async setOrientation(deviceId: string, orientation: "portrait" | "landscape"): Promise<void> {
    return await invoke("set_orientation", { deviceId, orientation });
  },

  /**
   * Send touch event to embedded control socket
   */
  async sendTouch(deviceId: string, action: string, x: number, y: number): Promise<void> {
    return await invoke("send_touch", { deviceId, action, x, y });
  },

  /**
   * Send keycode event to embedded control socket
   */
  async sendKey(deviceId: string, keycode: number, action: string): Promise<void> {
    return await invoke("send_key", { deviceId, keycode, action });
  },

  /**
   * Send text input to embedded control socket
   */
  async sendText(deviceId: string, text: string): Promise<void> {
    return await invoke("send_text", { deviceId, text });
  },

  /**
   * Send scroll event to embedded control socket
   */
  async sendScroll(deviceId: string, x: number, y: number, dx: number, dy: number): Promise<void> {
    return await invoke("send_scroll", { deviceId, x, y, dx, dy });
  },
};
