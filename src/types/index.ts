export * from "./tauri-commands";

// Device models matching Rust backend types
export type ConnectionType = "USB" | "Wireless";

export type DeviceStatus =
  "Connected" | "Disconnected" | "Unauthorized" | "Offline";

export interface DeviceConnection {
  id: string;
  connection_type: ConnectionType;
  status: DeviceStatus;
  ip_address?: string;
  port?: number;
}

export interface Device {
  hardware_id: string;
  id: string;
  name: string;
  model: string;
  connection_type: ConnectionType;
  status: DeviceStatus;
  ip_address?: string;
  connections: DeviceConnection[];
  favorite?: boolean;
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
  theme: "light" | "dark" | "system";
  language: "en" | "es";

  mcpEnabled: boolean;
  mcpPort: number;
  mcpRequireAuth: boolean;
  mcpLogLevel: "error" | "info" | "debug";
}

// Default settings
export const DEFAULT_SETTINGS: Settings = {
  resolution: "default",
  bitrate: 8000000,
  maxFps: 60,
  alwaysOnTop: false,
  stayAwake: true,
  turnScreenOff: false,
  theme: "system",
  language: "en",
  mcpEnabled: true,
  mcpPort: 48484,
  mcpRequireAuth: true,
  mcpLogLevel: "info",
};

export interface DeviceDetails {
  serial: string;
  manufacturer: string;
  android_version: string;
  battery_level: number;
  storage_used_gb: number;
  storage_total_gb: number;
}

export interface AppInfo {
  package_name: string;
  is_system: boolean;
}

export interface FileInfo {
  name: string;
  is_dir: boolean;
  size: string;
  modified_at: string;
  permissions: string;
}
