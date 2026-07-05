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

export interface MdnsService {
  instance_name: string;
  service_type: string;
  address: string;
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

// Settings for the application
export interface Settings {
  resolution: string;
  bitrate: number;
  maxFps: number;
  alwaysOnTop: boolean;
  stayAwake: boolean;
  turnScreenOff: boolean;
  theme: 'light' | 'dark' | 'system';
}

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  resolution: 'default',
  bitrate: 8000000,
  maxFps: 60,
  alwaysOnTop: false,
  stayAwake: true,
  turnScreenOff: false,
  theme: 'system',
};
