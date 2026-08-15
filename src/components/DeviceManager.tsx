import { useState, useRef, useEffect } from "react";
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
  Wifi,
  Usb,
  AlertTriangle,
  HelpCircle,
  Pin,
  Minimize2,
} from "lucide-react";
import {
  scrcpyService,
  deviceService,
  mcpService,
  windowService,
} from "../services";
import { PhoneMockup } from "./PhoneMockup";
import { useMirrorDecoder, useMirrorInput } from "../hooks";
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

interface DeviceManagerProps {
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
  onDimensionsChange?: (dimensions: { width: number; height: number }) => void;
}

export function DeviceManager({
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
  onDimensionsChange,
}: DeviceManagerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const { prompt } = useInputDialog();

  const {
    status,
    errorMsg,
    classifiedError,
    isAutoRetrying,
    retryCountdown,
    retryAttempt,
    effectiveTransportId,
    dimensions,
    isPoppedOut,
    canvasRef,
    transportRef,
    retryCountRef,
    MAX_AUTO_RETRIES,
    handleStop,
    switchTransport,
    startMirroring,
    retryMirroring,
    cancelRetry,
    popOutMirror,
    bringMirrorBack,
    focusPopoutWindow,
  } = useMirrorDecoder({
    deviceId,
    autoStart,
    isPopup,
    onTransportChange,
    toast,
  });

  const [isAlwaysOnTop, setIsAlwaysOnTop] = useState(false);

  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [details, setDetails] = useState<DeviceDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isChangingOrientation, setIsChangingOrientation] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const mirrorStageRef = useRef<HTMLDivElement>(null);
  const actionToolbarRef = useRef<HTMLElement>(null);

  const {
    canvasProps,
    containerProps,
    sendNavigationKey,
  } = useMirrorInput({
    transportId: effectiveTransportId,
    status,
    dimensions,
    canvasRef,
    containerRef,
    enableShortcuts: true,
  });

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      const isOnline =
        deviceStatus !== "Offline" && deviceStatus !== "Disconnected";

      if (isOnline) {
        setIsLoadingDetails(true);
        try {
          const data =
            await deviceService.getDeviceDetails(effectiveTransportId);
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
      } else {
        if (active) setDetails(null);
      }
    };
    fetchDetails();
    return () => {
      active = false;
    };
  }, [effectiveTransportId, deviceStatus]);

  // Notify the parent (EmbeddedMirrorPopup) of the device dimensions so it can
  // size the popout window. Popup sizing is centralized in EmbeddedMirrorPopup's
  // handleDimensionsChange and its resize listener.
  useEffect(() => {
    if (dimensions.width > 0 && dimensions.height > 0) {
      onDimensionsChange?.(dimensions);
    }
  }, [dimensions.width, dimensions.height, onDimensionsChange]);


  const handleRename = async () => {
    const newName = await prompt({
      title: t("devices.actions.rename_device"),
      defaultValue: deviceName,
      confirmText: t("devices.actions.rename"),
      placeholder: t("devices.actions.enter_new_name"),
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
  const usbConn = connectedConnections.find(
    (connection) => connection.connection_type === "USB",
  );
  const isCurrentlyWifi =
    effectiveTransportId.includes(":") ||
    availableConnections?.find((c) => c.id === effectiveTransportId)
      ?.connection_type === "Wireless" ||
    (!availableConnections?.length && connectionType === "Wireless");
  const canFallbackToUsb =
    isCurrentlyWifi && !!usbConn && usbConn.id !== effectiveTransportId;
  const connectionSummary =
    [
      ...new Set(
        connectedConnections.map((connection) => {
          const type = connection.connection_type.toLowerCase();
          return t(`devices.connection.${type}`);
        }),
      ),
    ].join(" + ") ||
    (connectionType ? t(`devices.connection.${connectionType.toLowerCase()}`) : "—");
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
      ref={containerRef}
      className={shellClass}
      {...containerProps}
    >
      {/* Mirror stage — fills remaining height/width */}
      <div
        ref={mirrorStageRef}
        className={`relative flex-1 min-w-0 min-h-0 flex items-center justify-center overflow-hidden select-none group/mirror ${
          isPopup ? "bg-[#0f1012]" : "bg-gray-100 dark:bg-black"
        } ${isLandscape ? "flex-col" : ""}`}
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
                {/* Popped Out State Hero Card or Standard Header */}
                {isPoppedOut ? (
                  <div className="bg-white dark:bg-[#16191b] border border-cyan-500/30 dark:border-cyan-500/20 rounded-2xl p-6 sm:p-7 shadow-lg shadow-black/5 relative overflow-hidden">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-500 flex-shrink-0">
                          <ExternalLink size={22} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <h2 className="text-xl font-bold text-app-text tracking-tight">
                              {deviceName}
                            </h2>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-xs font-semibold border border-cyan-500/20">
                              <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                              {t(
                                "mirror.popped_out_title",
                                "Screen popped out to standalone window",
                              )}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-app-muted mt-1">
                            {t(
                              "mirror.popped_out_desc",
                              "Mirroring is currently active in the floating window.",
                            )}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* 1-Click Action Buttons */}
                    <div className="flex flex-wrap items-center gap-3 mt-5 pt-4 border-t border-gray-200/50 dark:border-[#222629]/50">
                      <button
                        onClick={() => void bringMirrorBack()}
                        className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs sm:text-sm font-semibold rounded-xl transition-all shadow-md shadow-cyan-600/20 active:scale-[0.98]"
                      >
                        <Minimize2 size={16} />
                        <span>
                          {t(
                            "mirror.bring_back",
                            "Bring mirror back to main window",
                          )}
                        </span>
                      </button>

                      <button
                        onClick={() => void focusPopoutWindow()}
                        className="flex items-center gap-2 px-4 py-2 bg-app-input hover:bg-app-hover text-app-text text-xs sm:text-sm font-medium rounded-xl border border-app-border transition-all active:scale-[0.98]"
                      >
                        <ExternalLink size={15} className="text-cyan-500" />
                        <span>
                          {t("mirror.focus_popout", "Focus popout window")}
                        </span>
                      </button>

                      <button
                        onClick={() => void handleStop()}
                        className="flex items-center gap-2 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-600 dark:text-red-400 text-xs sm:text-sm font-medium rounded-xl transition-all active:scale-[0.98]"
                      >
                        <Square size={14} fill="currentColor" />
                        <span>
                          {t("mirror.stop_mirroring", "Stop Mirroring")}
                        </span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-start gap-8 pb-4">
                    {/* Clean Phone Frame Mockup */}
                    <div className="hidden sm:flex items-center justify-center relative flex-shrink-0 px-3 py-1">
                      <PhoneMockup
                        status={deviceStatus || "Connected"}
                        deviceName={deviceName}
                      />
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
                          </div>
                          <p className="text-sm text-app-muted font-medium mt-1">
                            {t(
                              `devices.status.${(deviceStatus || "Connected").toLowerCase()}`,
                            )}
                          </p>
                        </div>

                        {/* Transport toggle or badge above mirror button */}
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

                          const isUsbConnected =
                            !!usbConn ||
                            (!availableConnections?.length &&
                              connectionType === "USB");
                          const isWifiConnected =
                            !!wifiConn ||
                            (!availableConnections?.length &&
                              connectionType === "Wireless");

                          if (usbConn && wifiConn) {
                            const isUsb = effectiveTransportId === usbConn.id;
                            return (
                              <div>
                                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-[#2a3036] bg-white dark:bg-[#1d2327] w-fit">
                                  <button
                                    onClick={() => {
                                      if (!isUsb)
                                        void switchTransport(usbConn.id);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                                      isUsb
                                        ? "bg-cyan-600 text-white"
                                        : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"
                                    }`}
                                  >
                                    <Usb size={13} />
                                    {t("devices.connection.usb")}
                                  </button>
                                  <div className="w-px bg-gray-200 dark:bg-[#2a3036]" />
                                  <button
                                    onClick={() => {
                                      if (isUsb)
                                        void switchTransport(wifiConn.id);
                                    }}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
                                      isUsb
                                        ? "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"
                                        : "bg-cyan-600 text-white"
                                    }`}
                                  >
                                    <Wifi size={13} />
                                    {t("devices.connection.wireless")}
                                  </button>
                                </div>
                              </div>
                            );
                          }

                          if (isUsbConnected) {
                            return (
                              <div>
                                <div className="rounded-lg bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 px-3 py-1 text-xs font-medium w-fit">
                                  USB
                                </div>
                              </div>
                            );
                          }

                          if (isWifiConnected) {
                            return (
                              <div>
                                <div className="rounded-lg bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 px-3 py-1 text-xs font-medium w-fit">
                                  WiFi
                                </div>
                              </div>
                            );
                          }

                          return null;
                        })()}

                        <div className="flex items-center gap-3">
                          <MirrorButton
                            size="md"
                            onClick={() => {
                              startMirroring();
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

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
                <div className="flex items-center gap-1.5 text-cyan-400 font-mono text-xs bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20 mt-2 mb-1 animate-pulse">
                  <RotateCw size={12} className="animate-spin" />
                  <span>
                    {retryCountdown > 0
                      ? `Reconnecting in ${retryCountdown}s (Attempt ${retryAttempt || retryCountRef.current}/${MAX_AUTO_RETRIES})`
                      : `Reconnecting (Attempt ${retryAttempt || retryCountRef.current}/${MAX_AUTO_RETRIES})...`}
                  </span>
                </div>

                {/* 1-Click USB Fallback Box if Wi-Fi retry is ongoing and USB is connected */}
                {canFallbackToUsb && usbConn && (
                  <div className="w-full max-w-[280px] p-3 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-left mt-3 mb-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-300 mb-1">
                      <Usb size={14} />
                      <span>{t("mirror.usb_connection_ready")}</span>
                    </div>
                    <p className="text-[11px] text-app-muted leading-tight mb-2.5">
                      {t("mirror.usb_mirroring_desc")}
                    </p>
                    <button
                      onClick={() => void switchTransport(usbConn.id, true)}
                      className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black text-xs font-semibold rounded-md shadow-sm transition-colors"
                    >
                      <Usb size={13} />
                      <span>{t("mirror.switch_to_usb_and_connect")}</span>
                    </button>
                  </div>
                )}

                <div className="flex flex-col gap-2 w-full max-w-[220px] mt-3">
                  {/* Other connection switch buttons */}
                  {(() => {
                    const otherConns = (availableConnections || []).filter(
                      (c) =>
                        c.id !== effectiveTransportId &&
                        c.status === "Connected" &&
                        (!canFallbackToUsb || c.id !== usbConn?.id),
                    );
                    return otherConns.map((conn) => (
                      <button
                        key={conn.id}
                        onClick={() => {
                          void switchTransport(conn.id, true);
                        }}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-medium rounded-lg transition-colors shadow-sm"
                      >
                        {conn.connection_type === "USB" ? (
                          <Usb size={14} />
                        ) : (
                          <Wifi size={14} />
                        )}
                        {t("mirror.switch_to", {
                          type:
                            conn.connection_type === "USB"
                              ? t("devices.connection.usb")
                              : t("devices.connection.wireless"),
                        })}
                      </button>
                    ));
                  })()}

                  <button
                    onClick={() => retryMirroring()}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-app-input hover:bg-app-hover text-app-text text-xs font-medium rounded-lg transition-colors border border-app-border"
                  >
                    <RotateCw size={13} />
                    <span>{t("mirror.retry_now")}</span>
                  </button>

                  <button
                    onClick={() => {
                      cancelRetry();
                    }}
                    className="px-4 py-1.5 text-app-muted hover:text-app-text text-xs rounded-lg transition-colors border border-transparent hover:border-app-border"
                  >
                    {t("mirror.stop_retrying")}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-app-card/95 dark:bg-[#0e1012]/95 z-10 text-center p-6 backdrop-blur-sm overflow-y-auto">
            <div className="w-12 h-12 rounded-full bg-red-500/10 dark:bg-red-500/20 border border-red-500/30 flex items-center justify-center text-red-500 mb-3 flex-shrink-0">
              <AlertTriangle size={24} />
            </div>

            <p className="text-app-text font-semibold text-base mb-1">
              {classifiedError?.title || t("mirror.stream_interrupted")}
            </p>
            <p className="text-app-muted text-xs max-w-md mb-3 font-mono break-words bg-black/20 dark:bg-white/5 px-3 py-1.5 rounded-md border border-app-border">
              {classifiedError?.message || errorMsg || t("mirror.connection_lost")}
            </p>

            {/* Resolution Box */}
            {classifiedError?.resolution && (
              <div className="bg-amber-500/10 dark:bg-amber-950/40 border border-amber-500/30 dark:border-amber-700/50 rounded-lg p-3 text-left max-w-md w-full mb-3 text-xs text-amber-900 dark:text-amber-300">
                <div className="flex items-center gap-1.5 font-semibold mb-1 text-amber-600 dark:text-amber-400">
                  <HelpCircle size={14} className="flex-shrink-0" />
                  <span>{t("mirror.recommended_action")}</span>
                </div>
                <p className="leading-relaxed text-[12px] opacity-90">
                  {classifiedError.resolution}
                </p>
              </div>
            )}

            {/* 1-Click USB Fallback Box if Wi-Fi encountered error and USB is connected */}
            {canFallbackToUsb && usbConn && (
              <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-3 max-w-md w-full mb-3 flex items-center justify-between gap-3 text-left">
                <div>
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
                    <Usb size={14} />
                    <span>{t("mirror.usb_connection_ready")}</span>
                  </div>
                  <p className="text-[11px] text-app-muted mt-0.5">
                    {t("mirror.usb_fallback_desc")}
                  </p>
                </div>
                <button
                  onClick={() => void switchTransport(usbConn.id, true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500 hover:bg-cyan-400 active:bg-cyan-600 text-black text-xs font-semibold rounded-md shadow transition-colors flex-shrink-0"
                >
                  <Usb size={13} />
                  <span>{t("mirror.use_usb")}</span>
                </button>
              </div>
            )}

            <div className="flex flex-col gap-2 w-full max-w-[240px]">
              {/* Other transport switch buttons */}
              {(() => {
                const otherConns = (availableConnections || []).filter(
                  (c) =>
                    c.id !== effectiveTransportId &&
                    c.status === "Connected" &&
                    (!canFallbackToUsb || c.id !== usbConn?.id),
                );
                return otherConns.map((conn) => (
                  <button
                    key={conn.id}
                    onClick={() => {
                      void switchTransport(conn.id, true);
                    }}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                  >
                    {conn.connection_type === "USB" ? (
                      <Usb size={15} />
                    ) : (
                      <Wifi size={15} />
                    )}
                    {t("mirror.switch_to", {
                      type:
                        conn.connection_type === "USB"
                          ? t("devices.connection.usb")
                          : t("devices.connection.wireless"),
                    })}
                  </button>
                ));
              })()}

              {/* Retry with current transport */}
              <button
                onClick={() => {
                  retryMirroring();
                }}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-app-input hover:bg-app-hover text-app-text text-sm font-medium rounded-lg transition-colors border border-app-border"
              >
                <RotateCw size={14} />
                <span>{t("mirror.retry")}</span>
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
          {...canvasProps}
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
          ref={actionToolbarRef}
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

            {/* Pop Out (Inline mode) */}
            {!isPopup && (
              <button
                onClick={() => void popOutMirror(deviceName)}
                title={t("mirror.popout_title", "Pop out in separate window")}
                className={`${toolbarButtonSize} flex items-center justify-center py-2 rounded-lg bg-app-input border border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40 transition-colors flex-shrink-0`}
              >
                <ExternalLink
                  size={18}
                  className="text-app-muted hover:text-app-text transition-colors"
                />
              </button>
            )}

            {/* Always-on-top toggle (Popout mode) */}
            {isPopup && (
              <button
                onClick={async () => {
                  try {
                    const { getCurrentWindow } = await import(
                      "@tauri-apps/api/window"
                    );
                    const next = !isAlwaysOnTop;
                    setIsAlwaysOnTop(next);
                    await getCurrentWindow().setAlwaysOnTop(next);
                    toast.success(
                      next
                        ? t("mirror.always_on_top", "Always on top enabled")
                        : t(
                            "mirror.unpin_always_on_top",
                            "Always on top disabled",
                          ),
                    );
                  } catch (err) {
                    console.error("Failed to toggle always-on-top:", err);
                  }
                }}
                title={
                  isAlwaysOnTop
                    ? t("mirror.unpin_always_on_top", "Unpin always on top")
                    : t("mirror.always_on_top", "Always on top")
                }
                className={`${toolbarButtonSize} flex items-center justify-center py-2 rounded-lg ${
                  isAlwaysOnTop
                    ? "bg-cyan-500/20 border-cyan-500/50 text-cyan-400"
                    : "bg-app-input border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40"
                } border transition-colors flex-shrink-0`}
              >
                <Pin
                  size={18}
                  className={
                    isAlwaysOnTop
                      ? "text-cyan-400 rotate-45 fill-current"
                      : "text-app-muted hover:text-app-text transition-colors"
                  }
                />
              </button>
            )}

            {/* Return to Main Window (Popout mode) */}
            {isPopup && (
              <button
                onClick={async () => {
                  try {
                    await windowService.focusMainWindow();
                    await windowService.closeCurrentWindow();
                  } catch {
                    if (onClose) onClose();
                  }
                }}
                title={t(
                  "mirror.return_to_main",
                  "Return to main window (Pop in)",
                )}
                className={`${toolbarButtonSize} flex items-center justify-center py-2 rounded-lg bg-app-input border border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40 transition-colors flex-shrink-0`}
              >
                <Minimize2
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
