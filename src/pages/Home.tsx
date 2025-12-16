import { useState, useEffect, useCallback } from "react";
import { DeviceList } from "../components/DeviceList";
import { WirelessSetupWizard } from "../components/WirelessSetupWizard";
import { IPInputDialog } from "../components/IPInputDialog";
import { SavedDevicesList } from "../components/SavedDevicesList";
import { SettingsPanel } from "../components/SettingsPanel";
import { Tooltip } from "../components/Tooltip";
import { useToast } from "../components/ToastProvider";
import { deviceService, scrcpyService } from "../services";
import type { Device, MirrorSession } from "../types";
import { MainLayout } from "../components/MainLayout";
import { Tabs, Tab } from "../components/ui/Tabs";

export function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [sessions, setSessions] = useState<MirrorSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [showWizard, setShowWizard] = useState(false);
  const [showIPDialog, setShowIPDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const toast = useToast();

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [deviceList, sessionList] = await Promise.all([
        deviceService.getConnectedDevices(),
        scrcpyService.getActiveSessions(),
      ]);
      setDevices(deviceList);
      setSessions(sessionList);
      if (deviceList.length === 0) {
        toast.info("No devices connected. Try connecting via USB or use the wireless setup wizard.");
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Failed to load device data";
      setError(errorMessage);
      toast.error(errorMessage);
      console.error(errorMessage, err);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
    const interval = setInterval(async () => {
      try {
        const sessionList = await scrcpyService.getActiveSessions();
        setSessions(sessionList);
      } catch (err) {
        console.error("Failed to poll for sessions", err);
      }
    }, 2000); // Poll every 2 seconds
    return () => clearInterval(interval);
  }, [loadData]);


  const handleWizardComplete = () => {
    setShowWizard(false);
    toast.success("Wireless setup completed!");
    loadData();
  };

  const handleIPDialogComplete = () => {
    setShowIPDialog(false);
    toast.success("Device connected successfully!");
    loadData();
  };

  const handleConnect = async (device: Device) => {
    if (!device.ip_address) return;
    try {
      await deviceService.connectWireless(device.ip_address);
      toast.success(`Connecting to ${device.name}...`);
      loadData();
    } catch (err) {
      toast.error(`Failed to connect to ${device.name}`);
    }
  };

  const handleDisconnect = async (device: Device) => {
    try {
      await deviceService.disconnect(device.id);
      toast.info(`Disconnected from ${device.name}`);
      loadData();
    } catch (err) {
      toast.error(`Failed to disconnect from ${device.name}`);
    }
  };

  const handleEnableWireless = async (device: Device) => {
    try {
      const ip = await deviceService.enableWirelessMode(device.id);
      toast.success(`Wireless mode enabled for ${device.name} at ${ip}`);
      loadData();
    } catch (err) {
      toast.error("Failed to enable wireless mode.");
    }
  };

  const HeaderContent = (
    <div className="flex justify-between items-center">
      <div className="flex items-center gap-3">
        <svg className="w-8 h-8 text-primary-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
        <h1 className="text-xl font-bold text-gray-800">Scrcpy GUI</h1>
      </div>
      <div className="flex items-center gap-2">
        <Tooltip content="Set up wireless connection">
          <button onClick={() => setShowWizard(true)} className="btn-secondary">
            Wireless Setup
          </button>
        </Tooltip>
        <Tooltip content="Connect to device using IP">
          <button onClick={() => setShowIPDialog(true)} className="btn-secondary">
            Connect by IP
          </button>
        </Tooltip>
        <Tooltip content="Refresh device list">
            <button onClick={loadData} disabled={isLoading} className="btn-ghost disabled:opacity-50">
              <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
          </Tooltip>
        <Tooltip content="Settings">
          <button onClick={() => setShowSettings(!showSettings)} className="btn-ghost">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  );

  return (
    <>
      <MainLayout header={HeaderContent}>
        {showSettings && (
          <div className="mb-4">
            <SettingsPanel />
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-4">
            <Tabs defaultTab="Connected Devices">
                <Tab name="Connected Devices">
                  <DeviceList
                    devices={devices}
                    sessions={sessions}
                    isLoading={isLoading}
                    error={error}
                    onConnect={handleConnect}
                    onDisconnect={handleDisconnect}
                    onEnableWireless={handleEnableWireless}
                    onSessionUpdate={loadData}
                    onRefresh={loadData}
                  />
                </Tab>
                <Tab name="Saved Devices">
                    <SavedDevicesList onDeviceConnected={loadData} />
                </Tab>
            </Tabs>
        </div>
      </MainLayout>

      {showWizard && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 animate-fade-in">
          <WirelessSetupWizard
            devices={devices}
            onComplete={handleWizardComplete}
            onCancel={() => setShowWizard(false)}
          />
        </div>
      )}

      {showIPDialog && (
        <IPInputDialog
          onComplete={handleIPDialogComplete}
          onCancel={() => setShowIPDialog(false)}
        />
      )}
    </>
  );
}
