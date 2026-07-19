import { useState, useRef, useEffect, useCallback } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  Square,
  Volume2,
  Volume1,
  Home,
  ArrowLeft,
  Layers,
  Power,
  ExternalLink,
  List,
  Copy,
  Battery,
  HardDrive,
  ChevronDown,
  ChevronRight,
  RotateCw,
  Edit2,
  Bot,
  Wifi,
  Usb,
} from "lucide-react";
import { scrcpyService, deviceService, mcpService } from "../services";
import { useMirrorDecoder } from "../hooks/useMirrorDecoder";
import type {
  Device,
  ConnectionType,
  DeviceStatus,
  DeviceConnection,
  DeviceDetails,
} from "../types";
import { useToast } from "./ToastProvider";
import { MirrorButton } from "./MirrorButton";
import { useInputDialog } from "./InputDialog";
import { useTranslation } from "react-i18next";

interface EmbeddedMirrorViewProps {
  deviceId: string;
  deviceName: string;
  onClose?: () => void;
  connectionType?: string;
  deviceModel?: string;
  deviceStatus?: string;
  deviceIp?: string;
  availableConnections?: DeviceConnection[];
  /** Edge-to-edge workspace layout (no card chrome) */
  fillWorkspace?: boolean;
  /** Whether this component is running inside a popped out standalone window */
  isPopup?: boolean;
  /** Auto-start streaming on mount (used by quick-mirror button) */
  autoStart?: boolean;
  onRename?: (newName: string) => void;
  onTransportChange?: (transportId: string) => void;
}

export function EmbeddedMirrorView({
  deviceId,
  deviceName,
  onClose,
  connectionType,
  deviceModel,
  deviceStatus,
  deviceIp,
  availableConnections,
  fillWorkspace = false,
  isPopup = false,
  autoStart = false,
  onRename,
  onTransportChange,
}: EmbeddedMirrorViewProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { prompt } = useInputDialog();

  const {
    status,
    errorMsg,
    isAutoRetrying,
    setIsAutoRetrying,
    effectiveTransportId,
    dimensions,
    isPoppedOut,
    setIsPoppedOut,
    canvasRef,
    transportRef,
    retryCountRef,
    MAX_AUTO_RETRIES,
    handleStop,
    switchTransport,
    startMirroring,
    retryMirroring,
    cancelRetry,
  } = useMirrorDecoder({
    deviceId,
    autoStart,
    isPopup,
    onTransportChange,
    toast,
  });

  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [details, setDetails] = useState<DeviceDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isChangingOrientation, setIsChangingOrientation] = useState(false);
  const isMouseDownRef = useRef(false);

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      if (deviceStatus === "Offline" || deviceStatus === "Disconnected") {
        setDetails(null);
        return;
      }
      setIsLoadingDetails(true);
      try {
        const data = await deviceService.getDeviceDetails(effectiveTransportId);
        if (active) {
          setDetails(data);
        }
      } catch (err) {
        console.error("Failed to fetch device details:", err);
      } finally {
        if (active) {
          setIsLoadingDetails(false);
        }
      }
    };
    fetchDetails();
    return () => {
      active = false;
    };
  }, [effectiveTransportId, deviceStatus]);

  const handleRename = async () => {
    const newName = await prompt({
      title: "Rename Device",
      defaultValue: deviceName,
      confirmText: "Rename",
      placeholder: "Enter new name",
    });
    if (newName && newName !== deviceName) {
      try {
        const savedDevices = await deviceService.getSavedDevices();
        const hardwareId = details?.serial || deviceId;
        const found = savedDevices.find(
          (d) =>
            d.id === deviceId ||
            d.id === effectiveTransportId ||
            d.hardware_id === hardwareId,
        );
        const updatedDevice: Device = found
          ? {
              ...found,
              name: newName,
              hardware_id: found.hardware_id || hardwareId,
            }
          : {
              hardware_id: hardwareId,
              id: effectiveTransportId,
              name: newName,
              connection_type: (connectionType as ConnectionType) || "USB",
              model: deviceModel || "",
              status: (deviceStatus as DeviceStatus) || "Connected",
              ip_address: deviceIp,
              connections: availableConnections || [],
            };
        await deviceService.saveDevice(updatedDevice);
        toast.success(t("toolbar.renamed", { name: newName }));
        onRename?.(newName);
      } catch (err) {
        console.error("Failed to rename device:", err);
        toast.error(t("toolbar.rename_failed"));
      }
    }
  };

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("mirror-status", {
        detail: {
          deviceId: effectiveTransportId,
          status: isPoppedOut ? "streaming" : status,
        },
      }),
    );
  }, [effectiveTransportId, status, isPoppedOut]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<any>("request_screenshot", async (event) => {
      if (
        event.payload.device_id !== deviceId &&
        event.payload.device_id !== effectiveTransportId
      )
        return;
      const canvas = canvasRef.current;
      if (!canvas || !dimensions.width || !dimensions.height) return;

      let dataBase64 = "";
      if (
        !event.payload.annotate ||
        !event.payload.elements ||
        event.payload.elements.length === 0
      ) {
        const dataUrl = canvas.toDataURL("image/png");
        dataBase64 = dataUrl.split(",")[1] || "";
      } else {
        const offCanvas = document.createElement("canvas");
        offCanvas.width = canvas.width;
        offCanvas.height = canvas.height;
        const ctx = offCanvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(canvas, 0, 0);
          const colors = [
            "#00ffff", // Cyan
            "#ffff00", // Yellow
            "#ff32ff", // Magenta
            "#32ff64", // Green
            "#ff9600", // Orange
          ];
          event.payload.elements.forEach((el: any, idx: number) => {
            if (!el.bounds) return;
            const [x1, y1, x2, y2] = el.bounds;
            const color = colors[idx % colors.length] || colors[0];
            ctx.strokeStyle = color;
            ctx.lineWidth = 3;
            ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);

            const badgeText = `[${el.id}]`;
            ctx.font = "bold 14px monospace";
            const textMetrics = ctx.measureText(badgeText);
            const badgeW = Math.max(28, textMetrics.width + 8);
            const badgeH = 20;
            ctx.fillStyle = color;
            ctx.fillRect(x1, y1, badgeW, badgeH);
            ctx.fillStyle = "#000000";
            ctx.fillText(badgeText, x1 + 4, y1 + 15);
          });
          const dataUrl = offCanvas.toDataURL("image/png");
          dataBase64 = dataUrl.split(",")[1] || "";
        }
      }

      if (dataBase64) {
        mcpService
          .submitScreenshot(
            event.payload.req_id,
            dataBase64,
            dimensions.width,
            dimensions.height,
            event.payload.elements || [],
          )
          .catch(() => {});
      }
    }).then((un) => {
      if (disposed) un();
      else unlisten = un;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [deviceId, effectiveTransportId, dimensions.width, dimensions.height]);

  // Touch and Mouse interactions
  const rafMoveId = useRef<number>(0);
  const scrollAcc = useRef({ x: 0, y: 0 });

  const getCanvasPoint = (
    canvas: HTMLCanvasElement,
    e: React.MouseEvent | React.WheelEvent,
  ) => {
    const rect = canvas.getBoundingClientRect();
    const intrinsicWidth = canvas.width || dimensions.width;
    const intrinsicHeight = canvas.height || dimensions.height;
    const scale = Math.min(
      rect.width / Math.max(1, intrinsicWidth),
      rect.height / Math.max(1, intrinsicHeight),
    );
    const renderedWidth = intrinsicWidth * scale;
    const renderedHeight = intrinsicHeight * scale;
    const offsetX = (rect.width - renderedWidth) / 2;
    const offsetY = (rect.height - renderedHeight) / 2;
    const contentX = e.clientX - rect.left - offsetX;
    const contentY = e.clientY - rect.top - offsetY;

    return {
      x: Math.max(0, Math.min(1, contentX / Math.max(1, renderedWidth))),
      y: Math.max(0, Math.min(1, contentY / Math.max(1, renderedHeight))),
      inside:
        contentX >= 0 &&
        contentX <= renderedWidth &&
        contentY >= 0 &&
        contentY <= renderedHeight,
    };
  };

  const handleCanvasMouseEvent = async (
    e: React.MouseEvent<HTMLCanvasElement>,
    action: string,
  ) => {
    if (status !== "streaming") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, inside } = getCanvasPoint(canvas, e);

    if (action === "down" && !inside) return;
    if (action === "down") isMouseDownRef.current = true;
    else if (action === "up") isMouseDownRef.current = false;
    else if (action === "move" && !isMouseDownRef.current) return;

    if (action === "move") {
      if (!rafMoveId.current) {
        rafMoveId.current = requestAnimationFrame(() => {
          rafMoveId.current = 0;
          scrcpyService
            .sendTouch(transportRef.current, action, x, y)
            .catch(() => {});
        });
      }
    } else {
      if (rafMoveId.current) {
        cancelAnimationFrame(rafMoveId.current);
        rafMoveId.current = 0;
      }
      try {
        await scrcpyService.sendTouch(transportRef.current, action, x, y);
      } catch {
        // Ignore transient touch socket errors
      }
    }
  };

  const handleWheel = async (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (status !== "streaming") return;
    e.preventDefault();
    const canvas = canvasRef.current;
    if (!canvas) return;
    const { x, y, inside } = getCanvasPoint(canvas, e);
    if (!inside) return;

    scrollAcc.current.x += e.deltaX;
    scrollAcc.current.y += e.deltaY;

    // Threshold for a single "tick" (Mac trackpads generate tiny deltas continuously)
    const TICK_THRESHOLD = 20;

    let dx = 0;
    let dy = 0;

    if (Math.abs(scrollAcc.current.x) >= TICK_THRESHOLD) {
      const ticks = Math.trunc(scrollAcc.current.x / TICK_THRESHOLD);
      dx = Math.max(-8, Math.min(8, -ticks));
      scrollAcc.current.x -= ticks * TICK_THRESHOLD;
    }

    if (Math.abs(scrollAcc.current.y) >= TICK_THRESHOLD) {
      const ticks = Math.trunc(scrollAcc.current.y / TICK_THRESHOLD);
      dy = Math.max(-8, Math.min(8, -ticks));
      scrollAcc.current.y -= ticks * TICK_THRESHOLD;
    }

    if (dx !== 0 || dy !== 0) {
      try {
        await scrcpyService.sendScroll(
          transportRef.current,
          Math.max(0, Math.min(1, x)),
          Math.max(0, Math.min(1, y)),
          dx,
          dy,
        );
      } catch {}
    }
  };

  const composingRef = useRef(false);
  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (status !== "streaming" || composingRef.current || e.key === "Dead")
      return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      try {
        await scrcpyService.sendText(transportRef.current, e.key);
      } catch {}
    } else {
      const keyMap: Record<string, number> = {
        Enter: 66,
        Backspace: 67,
        Delete: 112,
        ArrowUp: 19,
        ArrowDown: 20,
        ArrowLeft: 21,
        ArrowRight: 22,
        Escape: 111,
        Tab: 61,
      };
      const keycode = keyMap[e.key];
      if (keycode) {
        e.preventDefault();
        try {
          await scrcpyService.sendKey(transportRef.current, keycode, "down");
          await scrcpyService.sendKey(transportRef.current, keycode, "up");
        } catch {}
      }
    }
  };

  const statusRef = useRef(status);
  statusRef.current = status;

  const sendNavigationKey = useCallback(async (keycode: number) => {
    if (statusRef.current !== "streaming") return;
    try {
      await scrcpyService.sendKey(transportRef.current, keycode, "down");
      await scrcpyService.sendKey(transportRef.current, keycode, "up");
    } catch {}
  }, []);

  useEffect(() => {
    if (status !== "streaming") return;

    const handleWindowKeyDown = async (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      let keycode: number | null = null;

      // Use Alt (Option on Mac) as modifier to avoid OS-level conflicts
      // (Cmd+H = hide, Cmd+S = save, Cmd+P = print on macOS)
      if (e.altKey) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === "b" || keyLower === "arrowleft") {
          keycode = 4; // Back
        } else if (keyLower === "h") {
          keycode = 3; // Home
        } else if (keyLower === "s" || keyLower === "r") {
          keycode = 187; // Recents / App Switcher
        } else if (keyLower === "p") {
          keycode = 26; // Power
        } else if (e.key === "ArrowUp") {
          keycode = 24; // Volume Up
        } else if (e.key === "ArrowDown") {
          keycode = 25; // Volume Down
        }
      } else {
        if (e.key === "Escape") {
          keycode = 4; // Back
        } else if (e.key === "Home") {
          keycode = 3; // Home
        }
      }

      if (keycode !== null) {
        e.preventDefault();
        e.stopPropagation();
        sendNavigationKey(keycode);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [status, sendNavigationKey]);

  const isLandscape = dimensions.width > dimensions.height;
  const targetOrientation = isLandscape ? "portrait" : "landscape";
  const toolbarButtonSize = isLandscape ? "w-10 h-10" : "w-full";

  const handleOrientationToggle = async () => {
    if (isChangingOrientation || status !== "streaming") return;
    setIsChangingOrientation(true);
    try {
      await scrcpyService.setOrientation(
        transportRef.current,
        targetOrientation,
      );
      await handleStop();
      startMirroring();
    } catch (err) {
      console.error("Failed to change orientation:", err);
      toast.error(t("mirror.orientation_failed"));
    } finally {
      setIsChangingOrientation(false);
    }
  };
  const connectedConnections =
    availableConnections?.filter(
      (connection) => connection.status === "Connected",
    ) || [];
  const connectionSummary =
    [
      ...new Set(
        connectedConnections.map((connection) => connection.connection_type),
      ),
    ].join(" + ") ||
    connectionType ||
    "—";
  const ipSummary =
    connectedConnections
      .filter((connection) => connection.connection_type === "Wireless")
      .map(
        (connection) =>
          connection.ip_address ||
          (connection.id.includes(":")
            ? connection.id.slice(0, connection.id.lastIndexOf(":"))
            : connection.id),
      )
      .join(", ") ||
    deviceIp ||
    "N/A (USB)";
  const shellClass = fillWorkspace
    ? `flex ${isLandscape ? "flex-col" : "flex-row"} h-full min-h-0 w-full bg-gray-100 dark:bg-black overflow-hidden focus:outline-none`
    : "flex flex-col h-full bg-app-card rounded-xl border border-app-border shadow-2xl overflow-hidden focus:outline-none";

  return (
    <div
      className={shellClass}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onCompositionStart={() => {
        composingRef.current = true;
      }}
      onCompositionEnd={async (e) => {
        composingRef.current = false;
        if (status === "streaming" && e.data) {
          try {
            await scrcpyService.sendText(transportRef.current, e.data);
          } catch {}
        }
      }}
    >
      {/* Mirror stage — fills remaining height/width */}
      <div
        className={`relative flex-1 min-w-0 min-h-0 flex items-center justify-center bg-gray-100 dark:bg-black overflow-hidden select-none group/mirror ${
          isLandscape ? "flex-col" : ""
        }`}
      >
        {status === "idle" &&
          (isPopup ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-app dark:bg-[#0e1012] p-6 text-center animate-fade-in">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin mb-3" />
              <h3 className="text-sm font-semibold text-app-text mb-1">
                {t("mirror.starting")}
              </h3>
              <p className="text-app-muted text-xs truncate max-w-xs">
                {deviceName}
              </p>
            </div>
          ) : (
            <div className="absolute inset-0 z-10 overflow-y-auto bg-app dark:bg-[#0e1012] p-6 sm:p-8 animate-fade-in flex flex-col justify-between">
              <div className="max-w-2xl mx-auto w-full space-y-6">
                {/* Device Header */}
                <div className="flex items-center justify-start gap-8 pb-4">
                  {/* Phone Placeholder */}
                  <div className="hidden sm:flex items-center justify-center opacity-20 pointer-events-none relative flex-shrink-0 px-6">
                    <Bot size={120} className="text-app-text" />
                  </div>

                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex flex-col gap-3 w-full">
                      <div>
                        <div
                          onClick={handleRename}
                          className="flex items-center gap-2 group cursor-pointer"
                          title={t("mirror.click_rename")}
                        >
                          <h2 className="text-2xl font-semibold text-app-text tracking-tight group-hover:text-cyan-500 transition-colors">
                            {deviceName}
                          </h2>
                          <Edit2
                            size={16}
                            className="text-app-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
                          />
                          {isPoppedOut && (
                            <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-900/50">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              {t("devices.status.mirroring")}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-app-muted font-medium mt-1">
                          {t(
                            `devices.status.${(deviceStatus || "Connected").toLowerCase()}`,
                          )}{" "}
                          • {connectionSummary}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {!isPoppedOut ? (
                          <MirrorButton
                            size="md"
                            onClick={() => {
                              startMirroring();
                            }}
                          />
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setIsPoppedOut(false);
                                startMirroring();
                              }}
                              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-app-input border border-app-border hover:bg-app-hover text-app-text font-medium text-sm transition-all shadow-sm active:scale-[0.98]"
                            >
                              <span>{t("mirror.attach_window")}</span>
                            </button>
                            <button
                              onClick={async () => {
                                setIsPoppedOut(false);
                                await handleStop();
                              }}
                              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 font-medium text-sm transition-all shadow-sm active:scale-[0.98]"
                            >
                              <Square size={14} fill="currentColor" />
                              <span>{t("mirror.stop_popout")}</span>
                            </button>
                          </>
                        )}
                      </div>

                      {/* Transport toggle when both USB + WiFi available */}
                      {(() => {
                        const usbConn = availableConnections?.find(
                          (c) =>
                            c.connection_type === "USB" &&
                            c.status === "Connected",
                        );
                        const wifiConn = availableConnections?.find(
                          (c) =>
                            c.connection_type === "Wireless" &&
                            c.status === "Connected",
                        );
                        if (!usbConn || !wifiConn) return null;
                        const isUsb = effectiveTransportId === usbConn.id;
                        return (
                          <div className="mt-4">
                            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-[#2a3036] bg-white dark:bg-[#1d2327] w-fit">
                              <button
                                onClick={() => {
                                  if (!isUsb) void switchTransport(usbConn.id);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                                  isUsb
                                    ? "bg-cyan-500 text-white"
                                    : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"
                                }`}
                              >
                                <Usb size={13} />
                                {t("devices.connection.usb")}
                              </button>
                              <div className="w-px bg-gray-200 dark:bg-[#2a3036]" />
                              <button
                                onClick={() => {
                                  if (isUsb) void switchTransport(wifiConn.id);
                                }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                                  isUsb
                                    ? "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"
                                    : "bg-cyan-500 text-white"
                                }`}
                              >
                                <Wifi size={13} />
                                {t("devices.connection.wireless")}
                              </button>
                            </div>
                          </div>
                        );
                      })()}

                      {/* Stats Cards */}
                      <div className="grid grid-cols-2 gap-4 mt-2 max-w-xs">
                        <div className="bg-white dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl p-4 shadow-md shadow-black/5 dark:shadow-none flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-app-muted mb-1">
                            <Battery size={16} />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                              {t("mirror.battery")}
                            </span>
                          </div>
                          <div className="text-xl font-semibold text-app-text">
                            {details
                              ? `${details.battery_level}%`
                              : isLoadingDetails
                                ? "..."
                                : "—"}
                          </div>
                        </div>
                        <div className="bg-white dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl p-4 shadow-md shadow-black/5 dark:shadow-none flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-app-muted mb-1">
                            <HardDrive size={16} />
                            <span className="text-[11px] font-semibold uppercase tracking-wider">
                              {t("mirror.storage")}
                            </span>
                          </div>
                          <div className="text-xl font-semibold text-app-text">
                            {details && details.storage_total_gb > 0 ? (
                              <>
                                {details.storage_used_gb}{" "}
                                <span className="text-xs text-app-muted font-normal">
                                  GB / {details.storage_total_gb} GB
                                </span>
                              </>
                            ) : isLoadingDetails ? (
                              "..."
                            ) : (
                              "—"
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Stats Cards moved up */}

                {/* Device Details List */}
                <div className="mt-6 bg-white dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl overflow-hidden shadow-md shadow-black/5 dark:shadow-none">
                  <div
                    onClick={() => setIsDetailsOpen(!isDetailsOpen)}
                    className="flex items-center gap-3 px-5 py-4 border-b border-gray-200/50 dark:border-[#222629]/50 text-app-text font-semibold text-[15px] cursor-pointer hover:bg-app-hover/30 transition-colors select-none"
                  >
                    <List size={18} className="text-app-muted" />
                    <span className="flex-1">{t("mirror.details.title")}</span>
                    {isDetailsOpen ? (
                      <ChevronDown size={18} className="text-app-muted" />
                    ) : (
                      <ChevronRight size={18} className="text-app-muted" />
                    )}
                  </div>
                  {isDetailsOpen && (
                    <div className="flex flex-col text-sm text-app-muted divide-y divide-gray-200/50 dark:divide-[#222629]/50">
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">{t("mirror.details.id")}</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">
                          {effectiveTransportId}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(effectiveTransportId);
                            toast.success(t("mirror.copied"));
                          }}
                          className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">
                          {t("mirror.details.model")}
                        </span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">
                          {deviceModel || "—"}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(deviceModel || "—");
                            toast.success(t("mirror.copied"));
                          }}
                          className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">
                          {t("mirror.details.connection")}
                        </span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">
                          {connectionSummary}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(connectionSummary);
                            toast.success(t("mirror.copied"));
                          }}
                          className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">
                          {t("mirror.details.ip_address")}
                        </span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">
                          {ipSummary}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(ipSummary);
                            toast.success(t("mirror.copied"));
                          }}
                          className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">
                          {t("mirror.details.serial")}
                        </span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">
                          {details
                            ? details.serial
                            : isLoadingDetails
                              ? "..."
                              : "—"}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              details?.serial || "—",
                            );
                            toast.success(t("mirror.copied"));
                          }}
                          className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">
                          {t("mirror.details.android_version")}
                        </span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">
                          {details
                            ? details.android_version
                            : isLoadingDetails
                              ? "..."
                              : "—"}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              details?.android_version || "—",
                            );
                            toast.success(t("mirror.copied"));
                          }}
                          className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">
                          {t("mirror.details.manufacturer")}
                        </span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">
                          {details
                            ? details.manufacturer
                            : isLoadingDetails
                              ? "..."
                              : "—"}
                        </span>
                        <button
                          onClick={() => {
                            navigator.clipboard.writeText(
                              details?.manufacturer || "—",
                            );
                            toast.success(t("mirror.copied"));
                          }}
                          className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"
                        >
                          <Copy size={14} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-app-card/90 dark:bg-[#0e1012]/90 z-10 text-center p-6 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin mb-4" />
            <p className="text-app-text font-medium text-sm">
              {isAutoRetrying ? t("mirror.reconnecting") : t("mirror.starting_mirror")}
            </p>
            {isAutoRetrying && (
              <>
                <p className="text-app-muted text-xs mt-1 max-w-sm">
                  {t("mirror.auto_retrying", { current: retryCountRef.current, max: MAX_AUTO_RETRIES })}
                </p>
                <div className="flex flex-col gap-2 w-full max-w-[220px] mt-4">
                  {(() => {
                    const otherConns = (availableConnections || []).filter(
                      (c) =>
                        c.id !== effectiveTransportId &&
                        c.status === "Connected",
                    );
                    return otherConns.map((conn) => (
                      <button
                        key={conn.id}
                        onClick={() => {
                          setIsAutoRetrying(false);
                          void switchTransport(conn.id);
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                      >
                        {conn.connection_type === "USB" ? (
                          <Usb size={15} />
                        ) : (
                          <Wifi size={15} />
                        )}
                        {t("mirror.switch_to", {
                          type: conn.connection_type === "USB"
                            ? t("devices.connection.usb")
                            : t("devices.connection.wireless")
                        })}
                      </button>
                    ));
                  })()}
                  <button
                    onClick={() => {
                      cancelRetry();
                    }}
                    className="px-4 py-2 text-app-muted hover:text-app-text text-xs rounded-lg transition-colors border border-transparent hover:border-app-border"
                  >
                    {t("mirror.stop_retrying")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-app-card/95 dark:bg-[#0e1012]/95 z-10 text-center p-6 backdrop-blur-sm">
            <p className="text-app-text font-semibold text-base mb-1">
              {t("mirror.stream_interrupted")}
            </p>
            <p className="text-app-muted text-xs max-w-md mb-4">
              {errorMsg || t("mirror.connection_lost")}
            </p>

            <div className="flex flex-col gap-2 w-full max-w-[220px]">
              {/* Switch transport buttons when multiple connections exist */}
              {(() => {
                const otherConns = (availableConnections || []).filter(
                  (c) =>
                    c.id !== effectiveTransportId && c.status === "Connected",
                );
                if (otherConns.length === 0) return null;
                return otherConns.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => {
                      void switchTransport(conn.id);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    {conn.connection_type === "USB" ? (
                      <Usb size={15} />
                    ) : (
                      <Wifi size={15} />
                    )}
                    {t("mirror.switch_to", {
                      type: conn.connection_type === "USB"
                        ? t("devices.connection.usb")
                        : t("devices.connection.wireless")
                    })}
                  </button>
                ));
              })()}

              {/* Retry with current transport */}
              <button
                onClick={() => {
                  retryMirroring();
                }}
                className="px-4 py-2.5 bg-app-input hover:bg-app-hover text-app-text text-sm font-medium rounded-lg transition-colors border border-app-border"
              >
                {t("mirror.retry")}
              </button>

              {/* Close */}
              <button
                onClick={() => {
                  void handleStop();
                }}
                className="px-4 py-2 text-app-muted hover:text-app-text text-xs rounded-lg transition-colors border border-transparent hover:border-app-border"
              >
                {t("mirror.close")}
              </button>
            </div>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={(e) => handleCanvasMouseEvent(e, "down")}
          onMouseMove={(e) => handleCanvasMouseEvent(e, "move")}
          onMouseUp={(e) => handleCanvasMouseEvent(e, "up")}
          onMouseLeave={(e) => {
            if (isMouseDownRef.current) void handleCanvasMouseEvent(e, "up");
          }}
          onWheel={handleWheel}
          className="max-w-full max-h-full w-auto h-auto object-contain transition-opacity duration-200"
          style={{
            opacity:
              status === "streaming" || status === "connecting" ? 1 : 0.2,
            // Prefer filling available height in portrait; width in landscape
            maxHeight: "100%",
            maxWidth: "100%",
          }}
        />
      </div>

      {/* Right Action Toolbar */}
      {status === "streaming" && (
        <aside
          className={`flex-shrink-0 bg-app-sidebar border-app-border flex gap-2 overflow-y-auto ${
            isLandscape
              ? "w-full h-16 border-t flex-row items-center justify-center px-3 py-1.5"
              : "w-[68px] h-full border-l flex-col px-2 py-3"
          }`}
        >
          {/* Action Buttons */}
          <div
            className={`flex gap-1.5 overflow-y-auto ${
              isLandscape
                ? "flex-row items-center flex-wrap justify-center"
                : "flex-col flex-1"
            }`}
          >
            {(
              [
                { key: 4, icon: ArrowLeft, label: "Back", shortcut: "Alt+B" },
                { key: 3, icon: Home, label: "Home", shortcut: "Alt+H" },
                { key: 187, icon: Layers, label: "Recent", shortcut: "Alt+R" },
                { key: 24, icon: Volume2, label: "Vol+", shortcut: "Alt+↑" },
                { key: 25, icon: Volume1, label: "Vol-", shortcut: "Alt+↓" },
                { key: 26, icon: Power, label: "Power", shortcut: "Alt+P" },
              ] as const
            ).map(({ key, icon: Icon, label, shortcut }) => (
              <button
                key={key}
                onClick={() => sendNavigationKey(key)}
                title={`${label} (${shortcut})`}
                className={`${toolbarButtonSize} flex items-center justify-center py-2 rounded-lg bg-app-input border border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40 transition-colors flex-shrink-0`}
              >
                <Icon
                  size={18}
                  className="text-app-muted hover:text-app-text transition-colors"
                />
              </button>
            ))}

            <div
              className={
                isLandscape
                  ? "w-px h-6 bg-app-border mx-1"
                  : "h-px bg-app-border my-0.5 flex-shrink-0"
              }
            />

            <button
              onClick={() => void handleOrientationToggle()}
              disabled={isChangingOrientation}
              title={`Switch to ${targetOrientation}`}
              className={`${toolbarButtonSize} flex items-center justify-center py-2 rounded-lg bg-app-input border border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40 transition-colors flex-shrink-0 disabled:opacity-50`}
            >
              <RotateCw
                size={18}
                className={
                  isChangingOrientation
                    ? "animate-spin text-cyan-400"
                    : "text-app-muted"
                }
              />
            </button>

            {/* Pop Out */}
            {!isPopup && (
              <button
                onClick={async () => {
                  const handlePopOut = async () => {
                    await handleStop();
                    try {
                      await scrcpyService.openMirrorWindow(
                        transportRef.current,
                        deviceName,
                      );
                      setIsPoppedOut(true);
                    } catch (err) {
                      console.error("Failed to open mirror window:", err);
                      toast.error(t("mirror.popout_failed"));
                    }
                  };
                  handlePopOut();
                }}
                title={t("mirror.popout_title")}
                className={`${toolbarButtonSize} flex items-center justify-center py-2 rounded-lg bg-app-input border border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40 transition-colors flex-shrink-0`}
              >
                <ExternalLink
                  size={18}
                  className="text-app-muted hover:text-app-text transition-colors"
                />
              </button>
            )}

            {/* Stop */}
            <button
              onClick={() => {
                handleStop();
                if (isPopup && onClose) onClose();
              }}
              title={t("mirror.stop_mirroring")}
              className={`${toolbarButtonSize} flex items-center justify-center py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0`}
            >
              <Square size={18} fill="currentColor" />
            </button>

            {/* Close modal if applicable */}
            {onClose && (
              <button
                onClick={() => {
                  handleStop();
                  onClose();
                }}
                title={t("mirror.close")}
                className={`${toolbarButtonSize} flex items-center justify-center py-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors text-base flex-shrink-0`}
              >
                ×
              </button>
            )}
          </div>
        </aside>
      )}
    </div>
  );
}
