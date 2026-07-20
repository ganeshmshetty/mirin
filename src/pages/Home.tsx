import { useState, useEffect, useCallback, useRef } from "react";
import { RefreshCw } from "lucide-react";
import { DeviceTable } from "../components/DeviceTable";
import { WifiPairPanel } from "../components/WifiPairPanel";
import { useToast } from "../components/ToastProvider";
import { deviceService } from "../services";
import type { Device } from "../types";
import { useTranslation } from "react-i18next";

interface HomeProps {
  refreshTrigger?: number;
  onShowWifiPanel?: () => void;
  showWifiPanel?: boolean;
  onCloseWifiPanel?: () => void;
}

export function Home({
  refreshTrigger = 0,
  onShowWifiPanel,
  showWifiPanel = false,
  onCloseWifiPanel,
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

  const handleRefresh = useCallback(async () => {
    setIsLoading(true);
    await loadData();
    toast.success(t("toolbar.refreshed"));
  }, [loadData, toast, t]);

  useEffect(() => {
    isMountedRef.current = true;
    loadData();
    return () => { isMountedRef.current = false; };
  }, [loadData]);

  // External refresh trigger (e.g. device-connected event)
  useEffect(() => {
    if (refreshTrigger > 0) loadData();
  }, [refreshTrigger, loadData]);

  // Auto-poll every 4s so USB + mDNS devices appear without manual refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (!showWifiPanel) loadData();
    }, 4000);
    return () => clearInterval(interval);
  }, [loadData, showWifiPanel]);

  const handleSwitchToWireless = async (deviceId: string) => {
    setSwitchingId(deviceId);
    try {
      const wirelessDevice = await deviceService.switchToWireless(deviceId);
      await deviceService.saveDevice(wirelessDevice);
      toast.success(`${t("toolbar.switched_wireless")} — ${wirelessDevice.ip_address}:5555`);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(msg);
    } finally {
      if (isMountedRef.current) setSwitchingId(null);
    }
  };

  const handleRenameDevice = async (deviceId: string, newName: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;
    const updated = { ...device, name: newName };
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? updated : d)));
    try {
      await deviceService.saveDevice(updated);
      toast.success(t("devices.renamed"));
    } catch {
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? device : d)));
      toast.error("Failed to rename device");
    }
  };

  const handleToggleFavorite = async (deviceId: string) => {
    const device = devices.find((d) => d.id === deviceId);
    if (!device) return;
    const updated = { ...device, favorite: !device.favorite };
    // Optimistic update
    setDevices((prev) => prev.map((d) => (d.id === deviceId ? updated : d)));
    try {
      await deviceService.saveDevice(updated);
    } catch {
      // Revert on failure
      setDevices((prev) => prev.map((d) => (d.id === deviceId ? device : d)));
      toast.error("Failed to update favorite");
    }
  };

  return (
    <div className="flex-1 flex flex-col relative overflow-hidden">
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

      {/* Device List */}
      <div className="flex-1 px-6 pt-6 pb-0 overflow-hidden flex flex-col bg-slate-100 dark:bg-[#111315]">
        <DeviceTable
          devices={devices}
          onConnectClick={onShowWifiPanel}
          onToggleFavorite={handleToggleFavorite}
          onSwitchToWireless={handleSwitchToWireless}
          switchingId={switchingId}
          onRenameDevice={handleRenameDevice}
        />
      </div>




      {/* Inline WiFi Pair Panel */}
      {showWifiPanel && (
        <WifiPairPanel
          onClose={onCloseWifiPanel ?? (() => {})}
          onDeviceConnected={loadData}
        />
      )}
    </div>
  );
}
