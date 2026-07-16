import { invoke } from "@tauri-apps/api/core";
import type { Device, MdnsService, DeviceDetails } from "../types";

/**
 * Service for device-related operations
 */
export const deviceService = {
  /**
   * Get dynamic device details (battery, storage, hardware version, manufacturer)
   */
  async getDeviceDetails(deviceId: string): Promise<DeviceDetails> {
    return await invoke<DeviceDetails>("get_device_details", { deviceId });
  },

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

  /**
   * Get resolved physical devices (merges connected and saved devices on backend)
   */
  async getResolvedDevices(): Promise<Device[]> {
    return await invoke<Device[]>("get_resolved_devices");
  },

  /**
   * Forget a device (backend handles disconnect, saved file cleanup, and auto-save suppression)
   */
  async forgetDevice(deviceId: string): Promise<boolean> {
    return await invoke<boolean>("forget_device", { deviceId });
  },

  /**
   * One-click switch a USB-connected device to wireless mode and connect
   */
  async switchToWireless(deviceId: string): Promise<Device> {
    return await invoke<Device>("switch_to_wireless", { deviceId });
  },

  /**
   * After connecting wirelessly, retry looking up the device in the connected list.
   * ADB may not reflect the new connection immediately.
   */
  async findConnectedAfterConnect(ip: string, port: number, maxRetries = 5): Promise<Device | null> {
    for (let i = 0; i < maxRetries; i++) {
      const devices = await this.getConnectedDevices();
      // Match traditional ip:port transports and TLS mDNS entries whose IP we resolved.
      const found = devices.find(
        d =>
          d.ip_address === ip ||
          d.id === `${ip}:${port}` ||
          d.id.startsWith(`${ip}:`) ||
          (d.connection_type === "Wireless" &&
            d.status === "Connected" &&
            (d.ip_address === ip || d.id.includes(ip)))
      );
      if (found) return found;
      if (i < maxRetries - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }
    return null;
  },
};
