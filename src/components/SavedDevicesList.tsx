import { useState, useEffect, useRef, useCallback } from "react";
import { emit } from "@tauri-apps/api/event";
import { deviceService } from "../services";
import { useConfirmDialog } from "./ConfirmDialog";
import type { Device } from "../types";
import { useTranslation } from "react-i18next";

import { getErrorMessage } from "../utils";

const isWirelessDevice = (device: Device) =>
  device.connection_type === "Wireless" || device.id.includes(":");

interface SavedDevicesListProps {
  onDeviceConnected: () => void;
}

export function SavedDevicesList({ onDeviceConnected }: SavedDevicesListProps) {
  const { t } = useTranslation();
  const [savedDevices, setSavedDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectingDeviceId, setConnectingDeviceId] = useState<string | null>(
    null,
  );

  // Abort controller for cancelling async operations on unmount
  const abortControllerRef = useRef<AbortController | null>(null);
  const isMountedRef = useRef(true);

  const { confirm } = useConfirmDialog();

  const loadSavedDevices = useCallback(async () => {
    // Cancel any pending request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    abortControllerRef.current = new AbortController();

    setLoading(true);
    setError(null);
    try {
      const devices = await deviceService.getSavedDevices();
      if (isMountedRef.current) {
        setSavedDevices(devices);
      }
    } catch (err) {
      if (
        isMountedRef.current &&
        !(err instanceof DOMException && err.name === "AbortError")
      ) {
        setError(
          err instanceof Error ? err.message : "Failed to load saved devices",
        );
        console.error("Error loading saved devices:", err);
      }
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    loadSavedDevices();

    let unlisten: (() => void) | undefined;
    let cancelled = false;
    import("@tauri-apps/api/event").then(({ listen }) => {
      listen("device-connected", () => {
        if (isMountedRef.current) {
          loadSavedDevices();
        }
      }).then((fn) => {
        if (cancelled) {
          fn();
        } else {
          unlisten = fn;
        }
      });
    });

    return () => {
      isMountedRef.current = false;
      cancelled = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      if (unlisten) unlisten();
    };
  }, [loadSavedDevices]);

  const handleConnect = async (device: Device) => {
    const isUsb = !isWirelessDevice(device);
    if (isUsb) {
      setError(
        `"${device.name}" is a USB device. To connect it, simply plug it into your computer via USB cable with USB Debugging enabled.`,
      );
      return;
    }

    const ip =
      device.ip_address ||
      (device.id.includes(":") ? device.id.split(":")[0] : null);
    if (!ip) {
      setError(
        "Cannot connect: No IP address recorded for this wireless device.",
      );
      return;
    }

    setConnectingDeviceId(device.id);
    setError(null);

    try {
      const wirelessConnection = device.connections?.find(
        (connection) => connection.connection_type === "Wireless",
      );
      const port =
        wirelessConnection?.port ||
        (device.id.includes(":")
          ? parseInt(device.id.split(":").pop() || "", 10)
          : 5555);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new Error(
          "Saved wireless device has no valid connect port. Reconnect it manually.",
        );
      }
      await deviceService.connectWireless(ip, port);
      await emit("device-connected");
      if (isMountedRef.current) {
        await loadSavedDevices();
        onDeviceConnected();
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(getErrorMessage(err));
      }
    } finally {
      if (isMountedRef.current) {
        setConnectingDeviceId(null);
      }
    }
  };

  const handleRemove = async (deviceId: string, deviceName: string) => {
    const confirmed = await confirm({
      title: "Forget Saved Device",
      message: `Are you sure you want to forget "${deviceName}"? You can always add it back later.`,
      confirmText: "Forget",
      cancelText: "Cancel",
      variant: "danger",
    });

    if (!confirmed) return;

    try {
      await deviceService.removeSavedDevice(deviceId);
      if (isMountedRef.current) {
        await loadSavedDevices(); // Refresh list
      }
    } catch (err) {
      if (isMountedRef.current) {
        setError(getErrorMessage(err));
      }
    }
  };

  if (loading && savedDevices.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Saved Devices</h2>
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading saved devices...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-gray-900">Saved Devices</h2>
        <button
          onClick={loadSavedDevices}
          disabled={loading}
          className="text-sm text-blue-600 hover:text-blue-700 disabled:text-blue-300"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {savedDevices.length === 0 ? (
        <div className="text-center py-8 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
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
              d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4"
            />
          </svg>
          <p className="mt-4 text-gray-600 font-medium">{t("devices.no_saved")}</p>
          <p className="text-sm text-gray-500 mt-1">
            {t("devices.no_saved_desc")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {savedDevices.map((device) => {
            const isWireless = isWirelessDevice(device);
            return (
              <div
                key={device.id}
                className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-gray-900">
                        {device.name}
                      </h3>
                      <span
                        className={`px-2 py-1 text-xs rounded font-medium ${
                          isWireless
                            ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"
                            : "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300"
                        }`}
                      >
                        {isWireless
                          ? t("devices.connection.wireless")
                          : t("devices.connection.usb")}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">{device.model}</p>
                    {device.ip_address && (
                      <p className="text-xs text-gray-500 mt-1">
                        IP: {device.ip_address}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 ml-4">
                    <button
                      onClick={() => handleConnect(device)}
                      disabled={connectingDeviceId === device.id}
                      className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                    >
                      {connectingDeviceId === device.id ? (
                        <span className="flex items-center gap-1">
                          <svg
                            className="animate-spin h-4 w-4"
                            fill="none"
                            viewBox="0 0 24 24"
                          >
                            <circle
                              className="opacity-25"
                              cx="12"
                              cy="12"
                              r="10"
                              stroke="currentColor"
                              strokeWidth="4"
                            />
                            <path
                              className="opacity-75"
                              fill="currentColor"
                              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                            />
                          </svg>
                          {t("devices.status.connecting")}
                        </span>
                      ) : (
                        t("devices.actions.connect")
                      )}
                    </button>
                    <button
                      onClick={() => handleRemove(device.id, device.name)}
                      className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-md hover:bg-red-50 transition-colors"
                      title={t("devices.actions.forget_device")}
                    >
                      <svg
                        className="h-4 w-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
        <p className="text-sm text-blue-900">
          💡 <strong>Tip:</strong> Saved devices will appear here for quick
          reconnection. Make sure your device is on the same network when
          connecting.
        </p>
      </div>
    </div>
  );
}
