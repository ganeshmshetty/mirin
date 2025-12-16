import { DeviceCard } from "./DeviceCard";
import type { Device, MirrorSession } from "../types";

interface DeviceListProps {
  devices: Device[];
  sessions: MirrorSession[];
  isLoading: boolean;
  error: string | null;
  onConnect: (device: Device) => void;
  onDisconnect: (device: Device) => void;
  onEnableWireless: (device: Device) => void;
  onSessionUpdate: () => void;
  onRefresh: () => void;
}

export function DeviceList({
  devices,
  sessions,
  isLoading,
  error,
  onConnect,
  onDisconnect,
  onEnableWireless,
  onSessionUpdate,
  onRefresh,
}: DeviceListProps) {

  if (isLoading && devices.length === 0) {
    return (
      <div className="text-center py-16">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-4 border-primary-600 border-t-transparent"></div>
        <p className="mt-4 text-gray-600 font-medium">Scanning for devices...</p>
      </div>
    );
  }

  if (devices.length === 0) {
    return (
      <div className="text-center py-16 px-4 border-2 border-dashed border-gray-200 rounded-lg bg-gray-50">
        <div className="w-16 h-16 mx-auto bg-gray-200 rounded-full flex items-center justify-center mb-4">
          <svg className="h-8 w-8 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
          </svg>
        </div>
        <h3 className="text-xl font-semibold text-gray-800 mb-2">No Devices Found</h3>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          Connect an Android device via USB or ensure wireless debugging is enabled.
        </p>
        <button onClick={onRefresh} className="btn-primary">
          Scan Again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full">
      {error && (
        <div className="mb-4 p-4 bg-red-50 border-l-4 border-red-500 rounded-r-lg">
          <p className="font-semibold text-red-900">Error</p>
          <p className="text-sm text-red-700 mt-1">{error}</p>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {devices.map((device) => {
          const activeSession = sessions.find((s) => s.device_id === device.id);
          return (
            <DeviceCard
              key={device.id}
              device={device}
              activeSession={activeSession}
              onConnect={onConnect}
              onDisconnect={onDisconnect}
              onEnableWireless={onEnableWireless}
              onSessionUpdate={onSessionUpdate}
            />
          );
        })}
      </div>
    </div>
  );
}
