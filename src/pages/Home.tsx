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

  const isMountedRef = useRef(true);
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
        // Create a map of merged devices
        const mergedDevicesMap = new Map<string, Device>();

        // 1. Add all saved devices first (default to Offline)
        savedDevices.forEach((device) => {
          mergedDevicesMap.set(device.id, { ...device, status: "Offline" });
        });

        // 2. Add or update connected devices
        for (const device of connectedDevices) {
          if (mergedDevicesMap.has(device.id)) {
            const existing = mergedDevicesMap.get(device.id)!;
            mergedDevicesMap.set(device.id, {
              ...device,
              name: existing.name || device.name, // Keep the custom name if it exists
            });
          } else {
            mergedDevicesMap.set(device.id, device);
          }
        }

        const finalList = Array.from(mergedDevicesMap.values());
        setDevices(finalList);
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

  // Forget saved device
  const handleRemoveDevice = async (deviceId: string) => {
    try {
      const device = devices.find(d => d.id === deviceId);
      // Disconnect only if it's a wireless device so it disappears from the active list
      // Calling disconnect on a USB device breaks ADB's USB tracking until physical replug
      if (device?.connection_type === "Wireless" || deviceId.includes(':')) {
        await deviceService.disconnect(deviceId).catch(() => {});
      }
      await deviceService.removeSavedDevice(deviceId);
      loadData();
    } catch (err) {
      toast.error("Failed to forget device");
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <header className="h-14 bg-white dark:bg-[#16191b] border-b border-gray-200 dark:border-[#222629] flex items-center justify-between px-6 flex-shrink-0 transition-colors">
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
      <div className="flex-1 p-6 overflow-hidden flex flex-col">
        <DeviceTable
          devices={devices}
          onRemoveDevice={handleRemoveDevice}
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
