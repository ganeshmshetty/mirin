/**
 * Type definitions for Tauri commands
 * These types match the Rust backend structures
 */

export enum ConnectionType {
  USB = "USB",
  Wireless = "Wireless",
}

export enum DeviceStatus {
  Connected = "Connected",
  Disconnected = "Disconnected",
  Unauthorized = "Unauthorized",
  Offline = "Offline",
}


export interface DeviceConnection {
  id: string;
  connection_type: ConnectionType;
  status: DeviceStatus;
  ip_address?: string;
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
}

export interface ScrcpyOptions {
  device_id: string;
  max_size?: number;
  bit_rate?: number;
  max_fps?: number;
  always_on_top: boolean;
  fullscreen: boolean;
  show_touches: boolean;
  stay_awake: boolean;
  turn_screen_off: boolean;
  record_file?: string;
}

export enum SessionStatus {
  Running = "Running",
  Stopped = "Stopped",
  Error = "Error",
}

export interface MirrorSession {
  session_id: string;
  device_id: string;
  status: SessionStatus;
  started_at: string;
}

export interface FrameEvent {
  event: "config" | "packet" | "disconnected";
  data: any;
}

export interface EmbeddedStreamSettings {
  max_size: number;
  max_fps: number;
  video_bit_rate: number;
  video_codec: string;
  audio: boolean;
}
