import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { DeviceTable } from "../components/DeviceTable";

// import { IPInputDialog } from "../components/IPInputDialog";
import { useToast } from "../components/ToastProvider";
import { deviceService } from "../services";
import type { Device } from "../types";

interface HomeProps {
  refreshTrigger?: number;
  onConnectClick?: () => void;
  onQuickMirrorClick?: () => void;
}

export function Home({ refreshTrigger = 0, onConnectClick, onQuickMirrorClick }: HomeProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  // Track hardware_ids that the user has explicitly "forgotten" so that
  // the auto-save logic doesn't immediately re-add them while they remain
  // physically connected (USB).
  const forgottenHwIdsRef = useRef<Set<string>>(new Set());
  const toast = useToast();

  // Load data
  const loadData = useCallback(async () => {
    try {
      // Fetch both connected and saved devices
      const [connectedDevices, savedDevices] = await Promise.all([
        deviceService.getConnectedDevices(),
        deviceService.getSavedDevices(),
      ]);

      if (isMountedRef.current) {
        const mergedDevicesMap = new Map<string, Device>();

        // 1. Add all saved devices first (default to Offline)
        savedDevices.forEach((device) => {
          mergedDevicesMap.set(device.id, { ...device, status: "Offline" });
        });

        // 2. Add or update connected devices
        for (const device of connectedDevices) {
          const existing = mergedDevicesMap.get(device.id);

          if (existing) {
            mergedDevicesMap.set(device.id, {
              ...device,
              name: existing.name || device.name,
            });
          } else {
            mergedDevicesMap.set(device.id, device);
          }
        }

        // 3. Deduplicate: if two entries share hardware_id (same physical device),
        //    merge them into one entry with combined connection info
        const hwMap = new Map<string, Device>();
        for (const device of mergedDevicesMap.values()) {
          const key = device.hardware_id || device.id;
          const existing = hwMap.get(key);
          if (existing) {
            const deviceConnected = device.status === "Connected";
            const existingConnected = existing.status === "Connected";
            const anyConnected = deviceConnected || existingConnected;
            // Prefer a live wireless transport, then any live transport. Saved
            // siblings must not make an offline USB transport look active.
            const transport = deviceConnected && device.connection_type === "Wireless" ? device
              : existingConnected && existing.connection_type === "Wireless" ? existing
              : deviceConnected ? device
              : existingConnected ? existing
              : device.connection_type === "Wireless" ? device
              : existing;
            hwMap.set(key, {
              ...existing,
              ...device,
              id: transport.id,
              name: existing.name || device.name,
              status: device.status === "Connected" ? device.status : existing.status,
              connection_type: transport.connection_type,
              connections: anyConnected
                ? [
                    ...(deviceConnected ? (device.connections || []) : []),
                    ...(existingConnected ? (existing.connections || []) : []),
                  ]
                : [
                    ...(existing.connections || []),
                    ...(device.connections || []),
                  ],
            });
          } else {
            hwMap.set(key, device);
          }
        }

        const finalList = Array.from(hwMap.values());
        setDevices(finalList);

        // Auto-save connected devices so they don't disappear when disconnected.
        // Skip any device the user has explicitly "forgotten" this session.
        (async () => {
          try {
            const forgotten = forgottenHwIdsRef.current;
            for (const device of finalList) {
              if (device.status === "Connected") {
                // Don't re-save a device the user just forgot
                if (forgotten.has(device.hardware_id)) continue;

                const saved = savedDevices.find(s => s.hardware_id === device.hardware_id);
                if (!saved) {
                  await deviceService.saveDevice(device);
                } else {
                  // Merge connections to preserve both USB and Wireless if one of them is new
                  const savedConnIds = new Set(saved.connections?.map(c => c.id) || []);
                  const hasNewConnection = device.connections?.some(c => !savedConnIds.has(c.id));
                  if (hasNewConnection) {
                    const mergedConnections = [...(saved.connections || [])];
                    for (const conn of device.connections || []) {
                      if (!savedConnIds.has(conn.id)) {
                        mergedConnections.push(conn);
                      }
                    }
                    const updatedDevice = {
                      ...saved,
                      connections: mergedConnections,
                      name: saved.name || device.name,
                    };
                    await deviceService.saveDevice(updatedDevice);
                  }
                }
              }
            }
          } catch (err) {
            console.error("Failed to auto-save or update devices:", err);
          }
        })();
      }
    } catch (err) {
      console.error("Failed to load devices:", err);
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Refresh handler
  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    await loadData();
    toast.success("Devices refreshed");
  }, [loadData, toast]);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();

    return () => {
      isMountedRef.current = false;
    };
  }, [loadData]);

  // External refresh trigger
  useEffect(() => {
    if (refreshTrigger > 0) {
      loadData();
    }
  }, [refreshTrigger, loadData]);

  // One-click switch USB device to wireless
  const handleSwitchToWireless = async (deviceId: string) => {
    setSwitchingId(deviceId);
    try {
      const wirelessDevice = await deviceService.switchToWireless(deviceId);
      await deviceService.saveDevice(wirelessDevice);
      toast.success(`Switched to wireless — ${wirelessDevice.ip_address}:5555`);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      if (isMountedRef.current) {
        setSwitchingId(null);
      }
    }
  };

  // Forget saved device
  const handleRemoveDevice = async (deviceId: string) => {
    try {
      const device = devices.find(d => d.id === deviceId);

      // Mark this device's hardware_id as forgotten so auto-save won't re-add
      // it while it remains physically connected (USB).
      if (device?.hardware_id) {
        forgottenHwIdsRef.current.add(device.hardware_id);
      }

      // Disconnect all wireless connections (for merged entries)
      if (device?.connections) {
        for (const conn of device.connections) {
          if (conn.connection_type === "Wireless") {
            await deviceService.disconnect(conn.id).catch(() => {});
          }
        }
      } else if (device?.connection_type === "Wireless" || deviceId.includes(':')) {
        await deviceService.disconnect(deviceId).catch(() => {});
      }

      // Remove all saved entries belonging to this device
      const idsToRemove = new Set<string>([deviceId]);
      if (device?.connections) {
        for (const conn of device.connections) {
          idsToRemove.add(conn.id);
        }
      }
      if (device?.hardware_id) {
        idsToRemove.add(device.hardware_id);
      }
      for (const id of idsToRemove) {
        await deviceService.removeSavedDevice(id).catch(() => {});
      }

      loadData();
    } catch (err) {
      toast.error("Failed to forget device");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <header className="h-14 bg-slate-100 dark:bg-[#111315] border-b border-gray-200 dark:border-[#222629] flex items-center justify-between px-6 flex-shrink-0 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">My Devices</h2>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#1d2327] rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </header>

      {/* Devices Section */}
      <div className="flex-1 p-6 overflow-hidden flex flex-col bg-slate-100 dark:bg-[#111315]">
        <DeviceTable
          devices={devices}
          onRemoveDevice={handleRemoveDevice}
          onSwitchToWireless={handleSwitchToWireless}
          switchingId={switchingId}
          onConnectClick={onConnectClick}
          onQuickMirrorClick={onQuickMirrorClick}
          onRenameDevice={(deviceId, newName) => {
            const device = devices.find(d => d.id === deviceId);
            if (device) {
              const updatedDevice = { ...device, name: newName };
              // Update local state immediately
              setDevices(prev => prev.map(d => d.id === deviceId ? updatedDevice : d));
              // Save to persistent storage
              deviceService.saveDevice(updatedDevice)
                .then(() => toast.success(`Renamed to ${newName}`))
                .catch(err => {
                  console.error("Failed to rename:", err);
                  toast.error("Failed to rename device");
                });
            }
          }}
        />
      </div>
    </div>
  );
}
