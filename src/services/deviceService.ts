import { invoke } from "@tauri-apps/api/core";
import type { Device, MdnsService } from "../types";

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
   * Pair with a device wirelessly using a pairing code (Android 11+)
   */
  async pairWireless(ip: string, port: number, pairingCode: string): Promise<boolean> {
    return await invoke<boolean>("pair_wireless_device", { ip, port, pairingCode });
  },

  /**
   * Discover mDNS services (Android 11+)
   */
  async getMdnsServices(): Promise<MdnsService[]> {
    return await invoke<MdnsService[]>("get_mdns_services");
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

  /**
   * Save a device to the saved devices list
   */
  async saveDevice(device: Device): Promise<boolean> {
    return await invoke<boolean>("save_device", { device });
  },

  /**
   * Get all saved devices
   */
  async getSavedDevices(): Promise<Device[]> {
    return await invoke<Device[]>("get_saved_devices");
  },

  /**
   * Remove a device from saved devices
   */
  async removeSavedDevice(deviceId: string): Promise<boolean> {
    return await invoke<boolean>("remove_saved_device", { deviceId });
  },
};
