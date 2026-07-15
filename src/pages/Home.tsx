import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { DeviceTable } from "../components/DeviceTable";

// import { IPInputDialog } from "../components/IPInputDialog";
import { useToast } from "../components/ToastProvider";
import { deviceService, scrcpyService, settingsService } from "../services";
import type { Device, MirrorSession, ScrcpyOptions, Settings } from "../types";

interface HomeProps {
  refreshTrigger?: number;
  onConnectClick?: () => void;
}

export function Home({ refreshTrigger = 0, onConnectClick }: HomeProps) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<MirrorSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // const [showIPDialog, setShowIPDialog] = useState(false);

  const isMountedRef = useRef(true);
  const toast = useToast();



  // Debounced device save removed to prevent auto-saving deleted devices.
  // Devices are now saved when paired via modal or when mirroring starts.

  // Load data
  const loadData = useCallback(async () => {
    try {
      // Fetch both connected and saved devices
      const [connectedDevices, savedDevices, sessionList] = await Promise.all([
        deviceService.getConnectedDevices(),
        deviceService.getSavedDevices(),
        scrcpyService.getActiveSessions(),
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
            const mergedDevice = {
              ...device,
              name: existing.name || device.name, // Keep the custom name if it exists
            };
            mergedDevicesMap.set(device.id, mergedDevice);
          }
        }

        const finalList = Array.from(mergedDevicesMap.values());
        setDevices(finalList);
        setSessions(sessionList);


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

  // Polling removed per user request
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

  // Start mirroring
  const handleStartMirroring = async (device: Device, connectionId?: string) => {
    try {
      // Default to the first connected connection if none provided
      const connections = Array.isArray(device.connections) ? device.connections : [];
      const targetConnectionId = connectionId || connections.find(c => c.status === "Connected")?.id || connections[0]?.id || device.id;
      if (!targetConnectionId) {
          throw new Error("No available connection for this device.");
      }

      const settings: Settings = await settingsService.loadSettings();
      const options: Partial<ScrcpyOptions> = {
        max_size: settings.resolution === "default" ? undefined : parseInt(settings.resolution),
        bit_rate: settings.bitrate,
        max_fps: settings.maxFps,
        always_on_top: settings.alwaysOnTop,
        stay_awake: settings.stayAwake,
        turn_screen_off: settings.turnScreenOff,
      };
      await scrcpyService.startMirroring(targetConnectionId, options);
      // Auto-save to history when mirroring successfully starts
      await deviceService.saveDevice(device).catch(() => {});
      toast.success(`Started mirroring ${device.name}`);
      loadData();
    } catch (err) {
      toast.error(`Failed to start mirroring: ${err}`);
    }
  };

  // Stop mirroring
  const handleStopMirroring = async (sessionId: string) => {
    try {
      await scrcpyService.stopMirroring(sessionId);
      toast.info("Mirroring stopped");
      loadData();
    } catch (err) {
      toast.error(`Failed to stop mirroring: ${err}`);
    }
  };

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

  // Connect to offline wireless device
  // const handleConnectDevice = async (device: Device) => {
  //   if (!device.id.includes(':')) return;
  //
  //   const parts = device.id.split(':');
  //   const ip = parts[0];
  //   const port = parseInt(parts[1]) || 5555;
  //
  //   try {
  //     await deviceService.connectWireless(ip, port);
  //     toast.success(`Connected to ${device.name}`);
  //     loadData();
  //   } catch (err: any) {
  //     const msg = err.message || String(err);
  //     toast.error(`Failed to connect: ${msg}`);
  //   }
  // };

  // Enable wireless
  // const handleEnableWireless = async () => {
  //   if (!selectedDevice) return;
  //   try {
  //     const ip = await deviceService.enableWirelessMode(selectedDevice.id);
  //     toast.success(`Wireless enabled at ${ip}`);
  //     // Force a reload to pick up the new wireless device and autosave it
  //     loadData();
  //   } catch (err) {
  //     const errorMsg = err instanceof Error ? err.message : String(err);
  //     console.error("Enable wireless error:", err);
  //     toast.error(`Failed to enable wireless mode: ${errorMsg}`);
  //   }
  // };

  // View logs - REMOVED

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
          sessions={sessions}
          onStartMirroring={handleStartMirroring}
          onStopMirroring={handleStopMirroring}
          onRemoveDevice={handleRemoveDevice}
          onConnectClick={onConnectClick}
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
                  // Revert on failure? Maybe unnecessary for now
                });
            }
          }}
        />
      </div>
    </div>
  );
}
