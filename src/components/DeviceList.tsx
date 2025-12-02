import { useState } from "react";
import { DeviceCard } from "./DeviceCard";
import { deviceService } from "../services";
import type { Device } from "../types";

interface DeviceListProps {
  devices?: Device[];
  onRefresh?: () => void;
  isLoading?: boolean;
}

export function DeviceList({ devices: propDevices, onRefresh, isLoading: propLoading }: DeviceListProps) {
  const [internalDevices, setInternalDevices] = useState<Device[]>([]);
  const [internalLoading, setInternalLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Use props if provided, otherwise use internal state
  const devices = propDevices ?? internalDevices;
  const loading = propLoading ?? internalLoading;

  const loadDevices = async () => {
    if (onRefresh) {
      // If parent provided onRefresh, use that
      onRefresh();
      return;
    }
    
    // Otherwise, load internally
    setInternalLoading(true);
    setError(null);
    try {
      const deviceList = await deviceService.getConnectedDevices();
      setInternalDevices(deviceList);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load devices");
      console.error("Error loading devices:", err);
    } finally {
      setInternalLoading(false);
    }
  };

  const handleConnect = async (device: Device) => {
    if (!device.ip_address) return;
    
    try {
      await deviceService.connectWireless(device.ip_address);
      loadDevices(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    }
  };

  const handleDisconnect = async (device: Device) => {
    try {
      await deviceService.disconnect(device.id);
      loadDevices(); // Refresh list
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
      loadDevices(); // Refresh list
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to enable wireless mode");
    }
  };

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center">
            <svg className="w-6 h-6 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Connected Devices</h2>
        </div>
        <button
          onClick={loadDevices}
          disabled={loading}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
        <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg animate-slide-down">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <div>
              <p className="font-semibold text-red-900">Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {loading && devices.length === 0 ? (
        <div className="card text-center py-16 animate-pulse">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
          <p className="mt-4 text-gray-600 font-medium">Scanning for devices...</p>
        </div>
      ) : devices.length === 0 ? (
        <div className="card text-center py-16 border-2 border-dashed border-gray-300 bg-gradient-to-br from-white to-gray-50">
          <div className="w-20 h-20 mx-auto bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <svg
              className="h-10 w-10 text-gray-400"
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
          </div>
          <h3 className="text-xl font-bold text-gray-900 mb-2">No devices found</h3>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            Connect an Android device via USB or ensure wireless debugging is enabled
          </p>
          <button
            onClick={loadDevices}
            className="btn-primary"
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

      <div className="mt-8 card bg-gradient-to-br from-primary-50 to-blue-50 border-primary-200">
        <div className="p-5">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-primary-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            <div className="flex-1">
              <h4 className="font-bold text-primary-900 mb-3">Quick Tips</h4>
              <ul className="text-sm text-primary-800 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-primary-600 mt-0.5">•</span>
                  <span>Connect your Android device via USB with USB debugging enabled</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-600 mt-0.5">•</span>
                  <span>Use "Enable Wireless" to switch from USB to wireless connection</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-primary-600 mt-0.5">•</span>
                  <span>Ensure your computer and phone are on the same WiFi network for wireless</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
