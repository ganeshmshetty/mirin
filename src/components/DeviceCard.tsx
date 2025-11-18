import { useState } from "react";
import type { Device } from "../types";
import { MirrorButton } from "./MirrorButton";
import { MirrorStatus } from "./MirrorStatus";

interface DeviceCardProps {
  device: Device;
  onConnect?: (device: Device) => void;
  onDisconnect?: (device: Device) => void;
  onEnableWireless?: (device: Device) => void;
}

export function DeviceCard({ device, onConnect, onDisconnect, onEnableWireless }: DeviceCardProps) {
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [isMirroring, setIsMirroring] = useState(false);
  
  const isConnected = device.status === "Connected";
  const isWireless = device.connection_type === "Wireless";
  const isUSB = device.connection_type === "USB";

  // Status badge color
  const statusColor = {
    Connected: "bg-green-100 text-green-800 border-green-200",
    Disconnected: "bg-gray-100 text-gray-800 border-gray-200",
    Unauthorized: "bg-yellow-100 text-yellow-800 border-yellow-200",
    Offline: "bg-red-100 text-red-800 border-red-200",
  }[device.status];

  const handleSessionStart = (newSessionId: string) => {
    setSessionId(newSessionId);
    setIsMirroring(true);
  };

  const handleSessionEnd = () => {
    setSessionId(undefined);
    setIsMirroring(false);
  };

  const handleCrashDetected = () => {
    console.warn(`Session crashed for device: ${device.name}`);
    // Auto-cleanup the UI state when crash is detected
    setTimeout(() => {
      handleSessionEnd();
    }, 3000); // Wait 3 seconds to show the crash message
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900">{device.name}</h3>
          <p className="text-sm text-gray-600">{device.model}</p>
          <p className="text-xs text-gray-500 mt-1">ID: {device.id}</p>
        </div>
        <div className="flex flex-col gap-2 items-end">
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusColor}`}>
            {device.status}
          </span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            isWireless ? "bg-blue-100 text-blue-800" : "bg-purple-100 text-purple-800"
          }`}>
            {device.connection_type}
          </span>
        </div>
      </div>

      {device.ip_address && (
        <div className="mb-3 text-sm text-gray-600">
          <span className="font-medium">IP:</span> {device.ip_address}
        </div>
      )}

      {/* Mirroring Status */}
      {isMirroring && sessionId && (
        <div className="mb-3">
          <MirrorStatus 
            sessionId={sessionId} 
            deviceName={device.name}
            onCrashDetected={handleCrashDetected}
          />
        </div>
      )}

      <div className="flex flex-col gap-2 mt-4">
        {/* Mirror Button */}
        {isConnected && (
          <MirrorButton
            device={device}
            sessionId={sessionId}
            isActive={isMirroring}
            onSessionStart={handleSessionStart}
            onSessionEnd={handleSessionEnd}
          />
        )}

        {/* Wireless/Connection Controls */}
        <div className="flex gap-2">
          {isUSB && isConnected && onEnableWireless && (
            <button
              onClick={() => onEnableWireless(device)}
              className="flex-1 px-3 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
            >
              Enable Wireless
            </button>
          )}
          
          {isWireless && !isConnected && onConnect && (
            <button
              onClick={() => onConnect(device)}
              className="flex-1 px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 transition-colors"
            >
              Connect
            </button>
          )}
          
          {isWireless && isConnected && onDisconnect && (
            <button
              onClick={() => onDisconnect(device)}
              className="flex-1 px-3 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 transition-colors"
            >
              Disconnect
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
