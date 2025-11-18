import { invoke } from "@tauri-apps/api/core";
import type { ScrcpyOptions, MirrorSession, SessionStatus } from "../types/tauri-commands";

export interface ProcessStats {
  active_sessions: number;
  total_started: number;
}

/**
 * Service for scrcpy-related operations
 */
export const scrcpyService = {
  /**
   * Start screen mirroring for a device
   */
  async startMirroring(
    deviceId: string,
    options?: Partial<ScrcpyOptions>
  ): Promise<string> {
    return await invoke<string>("start_mirroring", { deviceId, options });
  },

  /**
   * Stop screen mirroring session
   */
  async stopMirroring(sessionId: string): Promise<boolean> {
    return await invoke<boolean>("stop_mirroring", { sessionId });
  },

  /**
   * Stop all active mirroring sessions
   */
  async stopAllMirroring(): Promise<number> {
    return await invoke<number>("stop_all_mirroring");
  },

  /**
   * Get mirroring status for a specific session
   */
  async getMirroringStatus(sessionId: string): Promise<SessionStatus> {
    return await invoke<SessionStatus>("get_mirroring_status", { sessionId });
  },

  /**
   * Get all active mirroring sessions
   */
  async getActiveSessions(): Promise<MirrorSession[]> {
    return await invoke<MirrorSession[]>("get_active_sessions");
  },

  /**
   * Get process statistics
   */
  async getProcessStats(): Promise<ProcessStats> {
    return await invoke<ProcessStats>("get_process_stats");
  },

  /**
   * Check if scrcpy is available
   */
  async checkAvailable(): Promise<boolean> {
    return await invoke<boolean>("check_scrcpy_available");
  },

  /**
   * Get scrcpy version
   */
  async getVersion(): Promise<string> {
    return await invoke<string>("get_scrcpy_version");
  },

  /**
   * Test scrcpy execution (gets version to verify it works)
   */
  async testExecution(): Promise<string> {
    return await invoke<string>("test_scrcpy_execution");
  },
};
