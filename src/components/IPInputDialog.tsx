import { useState } from "react";
import { deviceService } from "../services";
import type { Device } from "../types";

interface IPInputDialogProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function IPInputDialog({ onComplete, onCancel }: IPInputDialogProps) {
  const [ipAddress, setIPAddress] = useState("");
  const [port, setPort] = useState("5555");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateIP = (ip: string): boolean => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;

    const parts = ip.split(".");
    return parts.every(part => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  };

  const handleConnect = async () => {
    setError(null);

    // Validate IP address
    if (!ipAddress.trim()) {
      setError("Please enter an IP address");
      return;
    }

    if (!validateIP(ipAddress)) {
      setError("Invalid IP address format");
      return;
    }

    // Validate port
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError("Port must be between 1 and 65535");
      return;
    }

    setLoading(true);

    try {
      const success = await deviceService.connectWireless(ipAddress, portNum);

      if (success) {
        // Get actual device info for hardware_id
        const connectedDevices = await deviceService.getConnectedDevices();
        const connectedDevice = connectedDevices.find(
          d => d.ip_address === ipAddress || d.id === `${ipAddress}:${portNum}`
        );

        // Save the device for future use
        const deviceId = `${ipAddress}:${portNum}`;
        const device: Device = {
          hardware_id: connectedDevice?.hardware_id || deviceId,
          id: deviceId,
          name: connectedDevice?.name || `Device (${ipAddress})`,
          model: connectedDevice?.model || "Unknown",
          connection_type: "Wireless",
          status: "Connected",
          ip_address: ipAddress,
          connections: [{
              id: deviceId,
              connection_type: "Wireless",
              status: "Connected",
              ip_address: ipAddress,
          }],
        };

        try {
          await deviceService.saveDevice(device);
        } catch (saveErr) {
          console.error("Failed to save device:", saveErr);
          // Don't fail the whole operation if save fails
        }
        onComplete();
      } else {
        setError("Failed to connect to device");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      handleConnect();
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Connect to Device</h2>

        <p className="text-gray-600 text-sm mb-4">
          Enter the IP address and port of your device. Make sure wireless debugging is enabled
          on your device and it's connected to the same network.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label htmlFor="ip" className="block text-sm font-medium text-gray-700 mb-1">
              IP Address
            </label>
            <input
              id="ip"
              type="text"
              value={ipAddress}
              onChange={(e) => setIPAddress(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="192.168.1.100"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="port" className="block text-sm font-medium text-gray-700 mb-1">
              Port
            </label>
            <input
              id="port"
              type="text"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="5555"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              disabled={loading}
            />
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-6">
          <p className="text-sm text-blue-900">
            💡 <strong>Tip:</strong> You can find your device's IP address in Settings → About
            Phone → Status (on most Android devices).
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            disabled={loading}
          >
            Cancel
          </button>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? "Connecting..." : "Connect"}
          </button>
        </div>
      </div>
    </div>
  );
}
