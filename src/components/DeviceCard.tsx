import { useState } from "react";
import type { Device, MirrorSession, ScrcpyOptions, Settings } from "../types";
import { MirrorButton } from "./MirrorButton";
import { MirrorStatus } from "./MirrorStatus";
import { scrcpyService, settingsService } from "../services";

interface DeviceCardProps {
  device: Device;
  activeSession?: MirrorSession;
  onConnect?: (device: Device) => void;
  onDisconnect?: (device: Device) => void;
  onEnableWireless?: (device: Device) => void;
  onSessionUpdate: () => void;
}

export function DeviceCard({ device, activeSession, onConnect, onDisconnect, onEnableWireless, onSessionUpdate }: DeviceCardProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isConnected = device.status === "Connected";
  const isWireless = device.connection_type === "Wireless";
  const isUSB = device.connection_type === "USB";

  const statusColor = {
    Connected: "bg-green-100 text-green-800 border-green-200",
    Disconnected: "bg-gray-100 text-gray-800 border-gray-200",
    Unauthorized: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Offline: "bg-red-100 text-red-800 border-red-200",
  }[device.status];

  const handleStartMirroring = async () => {
    try {
      setLoading(true);
      setError(null);
      const settings: Settings = await settingsService.loadSettings();
      const options: Partial<ScrcpyOptions> = {
        max_size: settings.resolution === 'default' ? undefined : parseInt(settings.resolution),
        bit_rate: settings.bitrate,
        max_fps: settings.maxFps,
        always_on_top: settings.alwaysOnTop,
        stay_awake: settings.stayAwake,
        turn_screen_off: settings.turnScreenOff,
      };
      await scrcpyService.startMirroring(device.id, options);
      onSessionUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleStopMirroring = async () => {
    if (!activeSession) return;
    try {
      setLoading(true);
      setError(null);
      await scrcpyService.stopMirroring(activeSession.session_id);
      onSessionUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCrashDetected = () => {
    console.warn(`Session crashed for device: ${device.name}`);
    setTimeout(() => {
      onSessionUpdate();
    }, 1000);
  };

  return (
    <div className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 transition-all duration-200 hover:shadow-md">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-bold text-gray-800">{device.name}</h3>
          <p className="text-sm text-gray-600 font-medium">{device.model}</p>
          <p className="text-xs text-gray-500 mt-1 font-mono">ID: {device.id}</p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <span className={`badge ${statusColor}`}>
            {device.status}
          </span>
          <span className={`badge ${
            isWireless ? "badge-info" : "bg-purple-100 text-purple-800 border-purple-200"
          }`}>
            {device.connection_type}
          </span>
        </div>
      </div>

      {device.status === 'Unauthorized' && (
        <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-800">
          <p className="font-bold mb-1">Authorization Required</p>
          <p>Please check your device and approve the USB debugging connection request from this computer.</p>
        </div>
      )}

      {device.ip_address && (
        <div className="mb-3 text-sm text-gray-600">
          <span className="font-medium">IP:</span> {device.ip_address}
        </div>
      )}

      {activeSession && (
        <div className="mb-3">
          <MirrorStatus 
            sessionId={activeSession.session_id}
            deviceName={device.name}
            onCrashDetected={handleCrashDetected}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 mt-4">
        {isConnected && (
          <MirrorButton
            device={device}
            isActive={!!activeSession}
            isLoading={loading}
            onStart={handleStartMirroring}
            onStop={handleStopMirroring}
            error={error}
          />
        )}

        <div className="flex gap-2">
          {isUSB && isConnected && onEnableWireless && (
            <button
              onClick={() => onEnableWireless(device)}
              className="flex-1 btn-secondary text-sm"
            >
              Enable Wireless
            </button>
          )}
          
          {isWireless && !isConnected && onConnect && (
            <button
              onClick={() => onConnect(device)}
              className="flex-1 btn-success text-sm"
            >
              Connect
            </button>
          )}
          
          {isWireless && isConnected && onDisconnect && (
            <button
              onClick={() => onDisconnect(device)}
              className="flex-1 btn-danger text-sm"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
