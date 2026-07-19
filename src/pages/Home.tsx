import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { DeviceTable } from "../components/DeviceTable";

// import { IPInputDialog } from "../components/IPInputDialog";
import { useToast } from "../components/ToastProvider";
import { deviceService } from "../services";
import type { Device } from "../types";
import { useTranslation } from "react-i18next";

interface HomeProps {
  refreshTrigger?: number;
  onConnectClick?: () => void;
  onQuickMirrorClick?: () => void;
}

export function Home({
  refreshTrigger = 0,
  onConnectClick,
  onQuickMirrorClick,
}: HomeProps) {
  const { t } = useTranslation();
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const isMountedRef = useRef(true);
  const toast = useToast();

  const loadData = useCallback(async () => {
    try {
      const resolvedDevices = await deviceService.getResolvedDevices();
      if (isMountedRef.current) {
        setDevices(resolvedDevices);
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
    toast.success(t("toolbar.refreshed"));
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
      toast.success(
        `${t("toolbar.switched_wireless")} — ${wirelessDevice.ip_address}:5555`,
      );
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
      await deviceService.forgetDevice(deviceId);
      loadData();
    } catch (err) {
      toast.error(t("toolbar.forget_failed"));
    }
  };

  return (
    <div className="flex-1 flex flex-col">
      {/* Toolbar */}
      <header className="h-14 bg-slate-100 dark:bg-[#111315] border-b border-gray-200 dark:border-[#222629] flex items-center justify-between px-6 flex-shrink-0 transition-colors">
        <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
          {t("toolbar.devices")}
        </h2>
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-[#1d2327] rounded-md transition-colors disabled:opacity-50"
        >
          <RefreshCw size={16} className={isLoading ? "animate-spin" : ""} />
          {t("toolbar.refresh")}
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
            const device = devices.find((d) => d.id === deviceId);
            if (device) {
              const updatedDevice = { ...device, name: newName };
              // Update local state immediately
              setDevices((prev) =>
                prev.map((d) => (d.id === deviceId ? updatedDevice : d)),
              );
              // Save to persistent storage
              deviceService
                .saveDevice(updatedDevice)
                .then(() =>
                  toast.success(t("toolbar.renamed", { name: newName })),
                )
                .catch((err) => {
                  console.error("Failed to rename:", err);
                  toast.error(t("toolbar.rename_failed"));
                });
            }
          }}
        />
      </div>
    </div>
  );
}
