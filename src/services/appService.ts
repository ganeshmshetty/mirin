import { invoke } from "@tauri-apps/api/core";
import type { AppInfo } from "../types";
import { open } from "@tauri-apps/plugin-dialog";

export const appService = {
  async listApps(deviceId: string): Promise<AppInfo[]> {
    return await invoke<AppInfo[]>("list_apps", { deviceId });
  },

  async installApp(deviceId: string): Promise<boolean> {
    const file = await open({
      multiple: false,
      filters: [{ name: "APK File", extensions: ["apk"] }],
    });
    
    if (file && typeof file === "string") {
      await invoke("install_app", { deviceId, apkPath: file });
      return true;
    }
    return false;
  },

  async uninstallApp(deviceId: string, packageName: string): Promise<void> {
    await invoke("uninstall_app", { deviceId, packageName });
  },

  async launchApp(deviceId: string, packageName: string): Promise<void> {
    await invoke("launch_app", { deviceId, packageName });
  },

  async clearAppData(deviceId: string, packageName: string): Promise<void> {
    await invoke("clear_app_data", { deviceId, packageName });
  },

  async stopApp(deviceId: string, packageName: string): Promise<void> {
    await invoke("stop_app", { deviceId, packageName });
  },
};
