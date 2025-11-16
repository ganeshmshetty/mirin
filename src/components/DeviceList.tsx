import { useState, useEffect } from "react";
import { DeviceCard } from "./DeviceCard";
import { deviceService } from "../services";
import type { Device } from "../types";

export function DeviceList() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDevices = async () => {
    setLoading(true);
    setError(null);
    try {
      const deviceList = await deviceService.getConnectedDevices();
      setDevices(deviceList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
      console.error("Error loading devices:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleConnect = async (device: Device) => {
    if (!device.ip_address) return;
    
    try {
      await deviceService.connectWireless(device.ip_address);
      await loadDevices(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  };

  const handleDisconnect = async (device: Device) => {
    try {
      await deviceService.disconnect(device.id);
      await loadDevices(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  const handleEnableWireless = async (device: Device) => {
    try {
      const ip = await deviceService.enableWirelessMode(device.id);
      setError(null);
      // Show success message with IP
      alert(`Wireless mode enabled! Device IP: ${ip}\n\nYou can now disconnect the USB cable and connect wirelessly.`);
      await loadDevices(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable wireless mode");
    }
  };

  return (
    <div className="w-full max-w-6xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-gray-900">Connected Devices</h2>
        <button
          onClick={loadDevices}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors flex items-center gap-2"
        >
          <svg
            className={`w-4 h-4 ${loading ? "animate-spin" : ""}`}
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
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-800 rounded-md">
          <p className="font-medium">Error</p>
          <p className="text-sm">{error}</p>
        </div>
      )}

      {loading && devices.length === 0 ? (
        <div className="text-center py-12">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Scanning for devices...</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <svg
            className="mx-auto h-12 w-12 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <h3 className="mt-4 text-lg font-medium text-gray-900">No devices found</h3>
          <p className="mt-2 text-sm text-gray-600">
            Connect an Android device via USB or ensure wireless debugging is enabled
          </p>
          <button
            onClick={loadDevices}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
          >
            Scan Again
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onEnableWireless={handleEnableWireless}
            />
          ))}
        </div>
      )}

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-md">
        <h4 className="font-medium text-blue-900 mb-2">Quick Tips</h4>
        <ul className="text-sm text-blue-800 space-y-1 list-disc list-inside">
          <li>Connect your Android device via USB with USB debugging enabled</li>
          <li>Use "Enable Wireless" to switch from USB to wireless connection</li>
          <li>Ensure your computer and phone are on the same WiFi network for wireless</li>
        </ul>
      </div>
    </div>
  );
}
