import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";

export interface LogcatPayload {
  device_id: string;
  line: string;
}

export const consoleService = {
  async startLogcat(deviceId: string): Promise<void> {
    await invoke("start_logcat", { deviceId });
  },

  async stopLogcat(deviceId: string): Promise<void> {
    await invoke("stop_logcat", { deviceId });
  },

  async executeShellCommand(
    deviceId: string,
    command: string,
  ): Promise<string> {
    return await invoke<string>("execute_shell_command", { deviceId, command });
  },

  async listenToLogcat(
    callback: (payload: LogcatPayload) => void,
  ): Promise<UnlistenFn> {
    return await listen<LogcatPayload>("logcat", (event) => {
      callback(event.payload);
    });
  },
};
