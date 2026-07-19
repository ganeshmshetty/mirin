import { invoke } from "@tauri-apps/api/core";
import { save, open } from "@tauri-apps/plugin-dialog";
import type { FileInfo } from "../types";

export const fileService = {
  async listFiles(deviceId: string, path: string): Promise<FileInfo[]> {
    return await invoke<FileInfo[]>("list_files", { deviceId, path });
  },

  async pullFile(
    deviceId: string,
    remotePath: string,
    defaultName: string,
  ): Promise<boolean> {
    const localPath = await save({
      defaultPath: defaultName,
    });

    if (localPath) {
      await invoke("pull_file", { deviceId, remotePath, localPath });
      return true;
    }
    return false;
  },

  async pushFile(deviceId: string, remoteDir: string): Promise<boolean> {
    const localPath = await open({
      multiple: false,
    });

    if (localPath && typeof localPath === "string") {
      // Determine remote path: remoteDir + / + localFilename
      const filename = localPath.split(/[\\/]/).pop();
      const remotePath = `${remoteDir.replace(/\/$/, "")}/${filename}`;
      await invoke("push_file", { deviceId, localPath, remotePath });
      return true;
    }
    return false;
  },

  async deleteFile(deviceId: string, path: string): Promise<void> {
    await invoke("delete_file", { deviceId, path });
  },

  async createDirectory(deviceId: string, path: string): Promise<void> {
    await invoke("create_directory", { deviceId, path });
  },
};
