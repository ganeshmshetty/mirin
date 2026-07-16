import { invoke } from "@tauri-apps/api/core";

/**
 * Service for Model Context Protocol (MCP) related operations
 */
export const mcpService = {
  /**
   * Submit an annotated screenshot frame back to the MCP registry
   */
  async submitScreenshot(
    reqId: string,
    dataBase64: string,
    width: number,
    height: number,
    annotatedElements: any[]
  ): Promise<void> {
    await invoke("submit_screenshot", {
      reqId,
      dataBase64,
      width,
      height,
      annotatedElements,
    });
  },
};
