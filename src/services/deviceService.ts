import { invoke } from "@tauri-apps/api/core";
import type { Device } from "../types";

/**
 * Service for device-related operations
 */
export const deviceService = {
  /**
   * Get all connected devices (USB and wireless)
   */
  async getConnectedDevices(): Promise<Device[]> {
    return await invoke<Device[]>("get_connected_devices");
  },

  /**
   * Connect to a device wirelessly
   */
  async connectWireless(ip: string, port?: number): Promise<boolean> {
    return await invoke<boolean>("connect_wireless_device", { ip, port });
  },

  /**
   * Disconnect a specific device
   */
  async disconnect(deviceId: string): Promise<boolean> {
    return await invoke<boolean>("disconnect_device", { deviceId });
  },

  /**
   * Enable wireless mode on a USB-connected device
   */
  async enableWirelessMode(deviceId: string): Promise<string> {
    return await invoke<string>("enable_wireless_mode", { deviceId });
  },

  /**
   * Refresh the device list
   */
  async refreshDevices(): Promise<Device[]> {
    return await invoke<Device[]>("refresh_devices");
  },
};
