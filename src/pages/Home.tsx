import { useState, useEffect } from "react";
import { DeviceList } from "../components/DeviceList";
import { ActiveSessions } from "../components/ActiveSessions";
import { ProcessManager } from "../components/ProcessManager";
import { WirelessSetupWizard } from "../components/WirelessSetupWizard";
import { IPInputDialog } from "../components/IPInputDialog";
import { SavedDevicesList } from "../components/SavedDevicesList";
import { SettingsPanel } from "../components/SettingsPanel";
import { LoadingSpinner } from "../components/LoadingSpinner";
import { Tooltip } from "../components/Tooltip";
import { useToast } from "../components/ToastProvider";
import { deviceService } from "../services";
import type { Device } from "../types";

export function Home() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showWizard, setShowWizard] = useState(false);
  const [showIPDialog, setShowIPDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const toast = useToast();

  const loadDevices = async () => {
    try {
      setIsLoading(true);
      const deviceList = await deviceService.getConnectedDevices();
      setDevices(deviceList);
      if (deviceList.length === 0) {
        toast.info("No devices connected. Connect a device via USB or use wireless setup.");
      }
    } catch (err) {
      console.error("Error loading devices:", err);
      toast.error("Failed to load devices. Please check ADB connection.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  const handleWizardComplete = () => {
    setShowWizard(false);
    toast.success("Wireless setup completed successfully!");
    loadDevices();
  };

  const handleIPDialogComplete = () => {
    setShowIPDialog(false);
    toast.success("Device connected successfully!");
    loadDevices();
  };

  return (
    <div className="min-h-screen py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Hero Section */}
        <div className="text-center mb-10 animate-slide-up">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl mb-4 shadow-lg">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-3">Android Screen Mirroring</h1>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            Connect your Android device and start mirroring wirelessly or via USB
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mb-8 flex flex-wrap gap-4 justify-center">
          <Tooltip content="Set up wireless connection step-by-step">
            <button
              onClick={() => setShowWizard(true)}
              className="btn-primary flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"
                />
              </svg>
              Wireless Setup Wizard
            </button>
          </Tooltip>

          <Tooltip content="Connect to device using IP address">
            <button
              onClick={() => setShowIPDialog(true)}
              className="btn-secondary flex items-center gap-2 shadow-md hover:shadow-lg"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 6v6m0 0v6m0-6h6m-6 0H6"
                />
              </svg>
              Connect by IP
            </button>
          </Tooltip>

          <Tooltip content="Configure mirroring settings">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="btn-ghost flex items-center gap-2 shadow-sm hover:shadow-md"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              {showSettings ? 'Hide Settings' : 'Settings'}
            </button>
          </Tooltip>

          <Tooltip content="Refresh device list">
            <button
              onClick={loadDevices}
              disabled={isLoading}
              className="btn-ghost flex items-center gap-2 shadow-sm hover:shadow-md disabled:opacity-50"
            >
              <svg className={`w-5 h-5 ${isLoading ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </Tooltip>
        </div>

        {/* Settings Panel */}
        {showSettings && (
          <div className="mb-8 animate-slide-down">
            <SettingsPanel />
          </div>
        )}

        {/* Saved Devices */}
        <div className="mb-8">
          <SavedDevicesList onDeviceConnected={loadDevices} />
        </div>
        
        {/* Process Manager */}
        <div className="mb-8">
          <ProcessManager />
        </div>

        {/* Active Sessions */}
        <div className="mb-8">
          <ActiveSessions />
        </div>

        {/* Device List */}
        {isLoading ? (
          <div className="card p-12">
            <LoadingSpinner size="lg" text="Loading devices..." />
          </div>
        ) : (
          <DeviceList devices={devices} onRefresh={loadDevices} isLoading={isLoading} />
        )}
      </div>

      {/* Modals */}
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
    </div>
  );
}
