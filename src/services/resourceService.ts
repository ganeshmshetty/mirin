import { invoke } from "@tauri-apps/api/core";

/**
 * Get the path to the bundled ADB executable
 * @returns Path to adb.exe
 */
export async function getAdbPath(): Promise<string> {
  return await invoke<string>("get_adb_path");
}

/**
 * Get the path to the bundled scrcpy executable
 * @returns Path to scrcpy.exe
 */
export async function getScrcpyPath(): Promise<string> {
  return await invoke<string>("get_scrcpy_path");
}

/**
 * Verify that all bundled resources (ADB and scrcpy) are available
 * @returns true if all resources are found, throws error otherwise
 */
export async function verifyBundledResources(): Promise<boolean> {
  return await invoke<boolean>("verify_bundled_resources");
}
