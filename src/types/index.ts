export * from "./tauri-commands";

// Device models matching Rust backend types
export type ConnectionType = 'USB' | 'Wireless';

export type DeviceStatus = 'Connected' | 'Disconnected' | 'Unauthorized' | 'Offline';

export interface Device {
  id: string;
  name: string;
  model: string;
  connection_type: ConnectionType;
  status: DeviceStatus;
  ip_address?: string;
}

// Scrcpy mirror options
export interface MirrorOptions {
  resolution?: string;
  bitrate?: number;
  maxFps?: number;
  alwaysOnTop?: boolean;
  stayAwake?: boolean;
  turnScreenOff?: boolean;
}
