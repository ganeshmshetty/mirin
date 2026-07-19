import { useState } from "react";
import { deviceService } from "../services";
import type { Device } from "../types";
import { useTranslation } from "react-i18next";

interface IPInputDialogProps {
  onComplete: () => void;
  onCancel: () => void;
}

export function IPInputDialog({ onComplete, onCancel }: IPInputDialogProps) {
  const { t } = useTranslation();
  const [ipAddress, setIPAddress] = useState("");
  const [port, setPort] = useState("5555");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateIP = (ip: string): boolean => {
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (!ipRegex.test(ip)) return false;

    const parts = ip.split(".");
    return parts.every((part) => {
      const num = parseInt(part, 10);
      return num >= 0 && num <= 255;
    });
  };

  const handleConnect = async () => {
    setError(null);

    // Validate IP address
    if (!ipAddress.trim()) {
      setError(t("manual_connect.error_ip_empty"));
      return;
    }

    if (!validateIP(ipAddress)) {
      setError(t("manual_connect.error_ip_invalid"));
      return;
    }

    // Validate port
    const portNum = parseInt(port, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) {
      setError(t("manual_connect.error_port_invalid"));
      return;
    }

    setLoading(true);

    try {
      const success = await deviceService.connectWireless(ipAddress, portNum);

      if (success) {
        // Retry looking up the device (ADB may not update immediately).
        // Prefer the live ADB transport id (may be TLS serial, not ip:port).
        const connectedDevice = await deviceService.findConnectedAfterConnect(
          ipAddress,
          portNum,
        );

        const deviceId = connectedDevice?.id || `${ipAddress}:${portNum}`;
        const device: Device = {
          hardware_id: connectedDevice?.hardware_id || deviceId,
          id: deviceId,
          name: connectedDevice?.name || `Device (${ipAddress})`,
          model: connectedDevice?.model || "Unknown",
          connection_type: "Wireless",
          status: "Connected",
          ip_address: connectedDevice?.ip_address || ipAddress,
          connections: connectedDevice?.connections?.length
            ? connectedDevice.connections
            : [
                {
                  id: deviceId,
                  connection_type: "Wireless",
                  status: "Connected",
                  ip_address: connectedDevice?.ip_address || ipAddress,
                },
              ],
        };

        try {
          await deviceService.saveDevice(device);
        } catch (saveErr) {
          console.error("Failed to save device:", saveErr);
          // Don't fail the whole operation if save fails
        }
        onComplete();
      } else {
        setError(t("manual_connect.failed_connect"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("manual_connect.failed_generic"));
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
        <h2 className="text-2xl font-bold text-gray-900 mb-4">
          {t("manual_connect.title")}
        </h2>

        <p className="text-gray-600 text-sm mb-4">
          {t("manual_connect.description")}
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label
              htmlFor="ip"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("manual_connect.ip_label")}
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
            <label
              htmlFor="port"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              {t("manual_connect.port_label")}
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
            💡 {t("manual_connect.tip")}
          </p>
        </div>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            disabled={loading}
          >
            {t("manual_connect.cancel")}
          </button>
          <button
            onClick={handleConnect}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
          >
            {loading ? t("manual_connect.connecting") : t("manual_connect.connect")}
          </button>
        </div>
      </div>
    </div>
  );
}
