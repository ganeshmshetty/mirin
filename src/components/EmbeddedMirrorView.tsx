import { useState, useRef, useEffect, useCallback } from "react";
import { Channel, invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  Square,
  Volume2,
  VolumeX,
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
  Edit2,
  Bot,
} from "lucide-react";
import { scrcpyService, deviceService } from "../services";
import type { Device, ConnectionType, DeviceStatus, FrameEvent, DeviceDetails } from "../types";
import { useToast } from "./ToastProvider";
import { MirrorButton } from "./MirrorButton";
import { useInputDialog } from "./InputDialog";

interface EmbeddedMirrorViewProps {
  deviceId: string;
  deviceName: string;
  onClose?: () => void;
  connectionType?: string;
  deviceModel?: string;
  deviceStatus?: string;
  deviceIp?: string;
  /** Edge-to-edge workspace layout (no card chrome) */
  fillWorkspace?: boolean;
  /** Whether this component is running inside a popped out standalone window */
  isPopup?: boolean;
  onRename?: (newName: string) => void;
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

export function EmbeddedMirrorView({
  deviceId,
  deviceName,
  onClose,
  connectionType,
  deviceModel,
  deviceStatus,
  deviceIp,
  fillWorkspace = false,
  isPopup = false,
  onRename,
}: EmbeddedMirrorViewProps) {
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const { prompt } = useInputDialog();

  const [status, setStatus] = useState<"idle" | "connecting" | "streaming" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({ width: 1080, height: 1920 });
  const [isPoppedOut, setIsPoppedOut] = useState(false);
  const [isDetailsOpen, setIsDetailsOpen] = useState(true);
  const [details, setDetails] = useState<DeviceDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchDetails = async () => {
      if (deviceStatus === "Offline" || deviceStatus === "Disconnected") {
        setDetails(null);
        return;
      }
      setIsLoadingDetails(true);
      try {
        const data = await deviceService.getDeviceDetails(deviceId);
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
  }, [deviceId, deviceStatus]);

  const handleRename = async () => {
    const newName = await prompt({
      title: "Rename Device",
      defaultValue: deviceName,
      confirmText: "Rename",
      placeholder: "Enter new name"
    });
    if (newName && newName !== deviceName) {
      try {
        const savedDevices = await deviceService.getSavedDevices();
        const found = savedDevices.find(d => d.id === deviceId);
        const updatedDevice: Device = found 
          ? { ...found, name: newName }
          : {
              hardware_id: deviceId,
              id: deviceId,
              name: newName,
              connection_type: (connectionType as ConnectionType) || "USB",
              model: deviceModel || "",
              status: (deviceStatus as DeviceStatus) || "Connected",
              ip_address: deviceIp,
              connections: [],
            };
        await deviceService.saveDevice(updatedDevice);
        toast.success(`Renamed to ${newName}`);
        onRename?.(newName);
      } catch (err) {
        console.error("Failed to rename device:", err);
        toast.error("Failed to rename device");
      }
    }
  };
  
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const pendingFrame = useRef<VideoFrame | null>(null);
  const rafId = useRef<number>(0);
  const isMouseDownRef = useRef(false);

  const isMountedRef = useRef(true);
  const isStoppedByUserRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Bumps on every start/stop so stale channels never schedule retries or update UI. */
  const connectGenRef = useRef(0);
  const connectingRef = useRef(false);

  const cleanupDecoder = useCallback(() => {
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }
    if (pendingFrame.current) {
      pendingFrame.current.close();
      pendingFrame.current = null;
    }
    if (decoderRef.current && decoderRef.current.state !== "closed") {
      decoderRef.current.close();
      decoderRef.current = null;
    }
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const handleStop = useCallback(async () => {
    isStoppedByUserRef.current = true;
    connectGenRef.current += 1; // invalidate any in-flight channel
    connectingRef.current = false;
    clearRetryTimer();
    cleanupDecoder();
    setStatus("idle");
    setIsPoppedOut(false);
    try {
      await scrcpyService.disconnectEmbeddedMirror(deviceId);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  }, [cleanupDecoder, clearRetryTimer, deviceId]);

  const handleStart = useCallback(async () => {
    if (!isMountedRef.current || isStoppedByUserRef.current) return;
    // One in-flight connect at a time (stale disconnects must not stack)
    if (connectingRef.current) return;

    clearRetryTimer();
    const gen = ++connectGenRef.current;
    connectingRef.current = true;

    cleanupDecoder();
    setStatus("connecting");
    setErrorMsg(null);
    setIsPoppedOut(false);

    const isCurrent = () =>
      isMountedRef.current &&
      !isStoppedByUserRef.current &&
      connectGenRef.current === gen;

    const retry = (delayMs: number) => {
      if (!isCurrent()) return;
      clearRetryTimer();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (isCurrent()) {
          void handleStart();
        }
      }, delayMs);
    };

    try {
      const channel = new Channel<FrameEvent>();
      channel.onmessage = (msg) => {
        if (!isCurrent()) return;

        if (msg.event === "config") {
          cleanupDecoder();
          const descBytes = b64ToBytes(msg.data.description);
          const description = descBytes.buffer.slice(
            descBytes.byteOffset,
            descBytes.byteOffset + descBytes.byteLength
          );
          const decoder = new VideoDecoder({
            output: (frame: VideoFrame) => {
              if (!isCurrent()) {
                frame.close();
                return;
              }

              if (pendingFrame.current) pendingFrame.current.close();
              pendingFrame.current = frame;
              if (!rafId.current) {
                rafId.current = requestAnimationFrame(() => {
                  rafId.current = 0;
                  const f = pendingFrame.current;
                  if (!f) return;
                  pendingFrame.current = null;
                  const canvas = canvasRef.current;
                  if (!canvas) { f.close(); return; }
                  if (canvas.width !== f.displayWidth || canvas.height !== f.displayHeight) {
                    canvas.width = f.displayWidth;
                    canvas.height = f.displayHeight;
                    setDimensions({ width: f.displayWidth, height: f.displayHeight });
                  }
                  const ctx = canvas.getContext("2d");
                  if (ctx) ctx.drawImage(f, 0, 0);
                  f.close();
                });
              }
            },
            error: (e: DOMException) => {
              console.error("Decoder error:", e);
              if (!isCurrent()) return;
              setErrorMsg(e.message || "Video decoder error");
              setStatus("error");
              retry(2500);
            },
          });
          
          decoderRef.current = decoder;

          const config: VideoDecoderConfig = {
            codec: msg.data.codec,
            description,
            hardwareAcceleration: "prefer-hardware",
          };

          VideoDecoder.isConfigSupported(config).then((result) => {
            if (!isCurrent()) return;
            if (!result.supported) {
              toastRef.current.error(`Codec ${msg.data.codec} is not supported on your hardware.`);
              setStatus("error");
              // Unsupported codec won't self-heal — do not thrash the device
              scrcpyService.disconnectEmbeddedMirror(deviceId).catch(() => {});
              return;
            }
            decoder.configure(config);
            setStatus("streaming");
          }).catch((err) => {
            console.error("Config check failed:", err);
            if (!isCurrent()) return;
            setStatus("error");
            retry(2500);
          });
        } else if (msg.event === "packet") {
          const decoder = decoderRef.current;
          if (!decoder || decoder.state !== "configured") return;
          const bytes = b64ToBytes(msg.data.data);
          decoder.decode(new EncodedVideoChunk({
            type: msg.data.key ? "key" : "delta",
            timestamp: msg.data.timestamp,
            data: bytes,
          }));
        } else if (msg.event === "disconnected") {
          cleanupDecoder();
          if (!isCurrent()) return;
          // Intentional replace/shutdown from a newer connect must not retry
          const reason = msg.data.reason || "Stream disconnected";
          if (reason === "Stream closed cleanly" || reason === "replaced") {
            setStatus("idle");
            return;
          }
          if (isPopup) {
            setErrorMsg(reason + " (Stream moved to main window or ended)");
            setStatus("error");
            return;
          }
          setErrorMsg(reason + ". Reconnecting automatically...");
          setStatus("error");
          retry(2000);
        }
      };

      const [w, h] = await scrcpyService.connectEmbeddedMirror(deviceId, channel, {
        max_size: 1080,
        max_fps: 60,
        video_bit_rate: 8000000,
        video_codec: "h264",
        audio: false,
      });

      if (!isCurrent()) {
        // Stale generation: a newer connect or unmount owns lifecycle now.
        // Do NOT disconnect here — that would kill a newer session on the same deviceId.
        return;
      }
      setDimensions({ width: w, height: h });
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
    } catch (err: any) {
      console.error("Embedded start error:", err);
      if (!isCurrent()) return;
      setErrorMsg(typeof err === "string" ? err : err.message || "Failed to start embedded stream");
      setStatus("error");
      cleanupDecoder();
      retry(2500);
    } finally {
      if (connectGenRef.current === gen) {
        connectingRef.current = false;
      }
    }
  }, [cleanupDecoder, clearRetryTimer, deviceId]);

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('mirror-status', { detail: { deviceId, status: isPoppedOut ? "streaming" : status } }));
  }, [deviceId, status, isPoppedOut]);

  useEffect(() => {
    isMountedRef.current = true;
    if (isPopup) {
      isStoppedByUserRef.current = false;
      void handleStart();
    } else {
      isStoppedByUserRef.current = true;
    }

    return () => {
      isMountedRef.current = false;
      connectGenRef.current += 1;
      connectingRef.current = false;
      clearRetryTimer();
      cleanupDecoder();
      scrcpyService.disconnectEmbeddedMirror(deviceId).catch(() => {});
    };
  }, [deviceId, cleanupDecoder, clearRetryTimer, isPopup, handleStart]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;
    listen<any>("request_screenshot", async (event) => {
      if (event.payload.device_id !== deviceId) return;
      const canvas = canvasRef.current;
      if (!canvas || !dimensions.width || !dimensions.height) return;

      let dataBase64 = "";
      if (!event.payload.annotate || !event.payload.elements || event.payload.elements.length === 0) {
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
        invoke("submit_screenshot", {
          reqId: event.payload.req_id,
          dataBase64,
          width: dimensions.width,
          height: dimensions.height,
          annotatedElements: event.payload.elements || [],
        }).catch(() => {});
      }
    }).then((un) => {
      if (disposed) un();
      else unlisten = un;
    });

    return () => {
      disposed = true;
      if (unlisten) unlisten();
    };
  }, [deviceId, dimensions.width, dimensions.height]);

  // Touch and Mouse interactions
  const rafMoveId = useRef<number>(0);
  const scrollAcc = useRef({ x: 0, y: 0 });

  const handleCanvasMouseEvent = async (e: React.MouseEvent<HTMLCanvasElement>, action: string) => {
    if (status !== "streaming") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));

    if (action === "down") isMouseDownRef.current = true;
    else if (action === "up") isMouseDownRef.current = false;
    else if (action === "move" && !isMouseDownRef.current) return;

    if (action === "move") {
      if (!rafMoveId.current) {
        rafMoveId.current = requestAnimationFrame(() => {
          rafMoveId.current = 0;
          scrcpyService.sendTouch(deviceId, action, x, y).catch(() => {});
        });
      }
    } else {
      if (rafMoveId.current) {
        cancelAnimationFrame(rafMoveId.current);
        rafMoveId.current = 0;
      }
      try {
        await scrcpyService.sendTouch(deviceId, action, x, y);
      } catch {
        // Ignore transient touch socket errors
      }
    }
  };

  const handleWheel = async (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (status !== "streaming") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    
    scrollAcc.current.x += e.deltaX;
    scrollAcc.current.y += e.deltaY;

    // Threshold for a single "tick" (Mac trackpads generate tiny deltas continuously)
    const TICK_THRESHOLD = 20;
    
    let dx = 0;
    let dy = 0;

    if (Math.abs(scrollAcc.current.x) >= TICK_THRESHOLD) {
      dx = scrollAcc.current.x > 0 ? -1 : 1;
      scrollAcc.current.x = 0;
    }
    
    if (Math.abs(scrollAcc.current.y) >= TICK_THRESHOLD) {
      dy = scrollAcc.current.y > 0 ? -1 : 1;
      scrollAcc.current.y = 0;
    }

    if (dx !== 0 || dy !== 0) {
      try {
        await scrcpyService.sendScroll(deviceId, Math.max(0, Math.min(1, x)), Math.max(0, Math.min(1, y)), dx, dy);
      } catch {}
    }
  };

  const composingRef = useRef(false);
  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;
    if (status !== "streaming" || composingRef.current || e.key === "Dead") return;
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      try {
        await scrcpyService.sendText(deviceId, e.key);
      } catch {}
    } else {
      const keyMap: Record<string, number> = {
        Enter: 66, Backspace: 67, Delete: 112,
        ArrowUp: 19, ArrowDown: 20, ArrowLeft: 21, ArrowRight: 22,
        Escape: 111, Tab: 61,
      };
      const keycode = keyMap[e.key];
      if (keycode) {
        e.preventDefault();
        try {
          await scrcpyService.sendKey(deviceId, keycode, "down");
          await scrcpyService.sendKey(deviceId, keycode, "up");
        } catch {}
      }
    }
  };

  const sendNavigationKey = async (keycode: number) => {
    if (status !== "streaming") return;
    try {
      await scrcpyService.sendKey(deviceId, keycode, "down");
      await scrcpyService.sendKey(deviceId, keycode, "up");
    } catch {}
  };

  const isLandscape = dimensions.width > dimensions.height;
  const shellClass = fillWorkspace
    ? "flex h-full min-h-0 w-full bg-gray-100 dark:bg-black overflow-hidden focus:outline-none"
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
            await scrcpyService.sendText(deviceId, e.data);
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
        {status === "idle" && (
          isPopup ? (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-app dark:bg-[#0e1012] p-6 text-center animate-fade-in">
              <div className="w-10 h-10 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin mb-3" />
              <h3 className="text-sm font-semibold text-app-text mb-1">Starting Mirror…</h3>
              <p className="text-app-muted text-xs truncate max-w-xs">{deviceName}</p>
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
                          title="Click to rename device"
                        >
                          <h2 className="text-2xl font-semibold text-app-text tracking-tight group-hover:text-cyan-500 transition-colors">{deviceName}</h2>
                          <Edit2 size={16} className="text-app-muted opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                          {isPoppedOut && (
                            <span className="ml-2 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-900/50">
                              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                              Mirroring
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-app-muted font-medium mt-1">
                          {deviceStatus || "Connected"} • {connectionType || "USB"}
                        </p>
                      </div>

                      <div className="flex items-center gap-3">
                        {!isPoppedOut ? (
                          <MirrorButton
                            size="md"
                            onClick={() => {
                              isStoppedByUserRef.current = false;
                              handleStart();
                            }}
                          />
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setIsPoppedOut(false);
                                isStoppedByUserRef.current = false;
                                handleStart();
                              }}
                              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-app-input border border-app-border hover:bg-app-hover text-app-text font-medium text-sm transition-all shadow-sm active:scale-[0.98]"
                            >
                              <span>Attach to Window</span>
                            </button>
                            <button
                              onClick={async () => {
                                setIsPoppedOut(false);
                                try {
                                  await scrcpyService.disconnectEmbeddedMirror(deviceId);
                                } catch (err) {
                                  console.error("Error stopping pop-out stream:", err);
                                }
                              }}
                              className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 font-medium text-sm transition-all shadow-sm active:scale-[0.98]"
                            >
                              <Square size={14} fill="currentColor" />
                              <span>Stop Pop-out</span>
                            </button>
                          </>
                        )}
                      </div>

                      {/* Stats Cards */}
                      <div className="grid grid-cols-2 gap-4 mt-2 max-w-xs">
                        <div className="bg-white dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl p-4 shadow-md shadow-black/5 dark:shadow-none flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-app-muted mb-1">
                            <Battery size={16} /> 
                            <span className="text-[11px] font-semibold uppercase tracking-wider">Battery</span>
                          </div>
                          <div className="text-xl font-semibold text-app-text">
                            {details ? `${details.battery_level}%` : (isLoadingDetails ? "..." : "—")}
                          </div>
                        </div>
                        <div className="bg-white dark:bg-[#16191b] border border-gray-200/50 dark:border-[#222629]/50 rounded-xl p-4 shadow-md shadow-black/5 dark:shadow-none flex flex-col gap-1">
                          <div className="flex items-center gap-2 text-app-muted mb-1">
                            <HardDrive size={16} /> 
                            <span className="text-[11px] font-semibold uppercase tracking-wider">Storage</span>
                          </div>
                          <div className="text-xl font-semibold text-app-text">
                            {details && details.storage_total_gb > 0 ? (
                              <>
                                {details.storage_used_gb} <span className="text-xs text-app-muted font-normal">GB / {details.storage_total_gb} GB</span>
                              </>
                            ) : (
                              isLoadingDetails ? "..." : "—"
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
                    <span className="flex-1">Device Details</span>
                    {isDetailsOpen ? (
                      <ChevronDown size={18} className="text-app-muted" />
                    ) : (
                      <ChevronRight size={18} className="text-app-muted" />
                    )}
                  </div>
                  {isDetailsOpen && (
                    <div className="flex flex-col text-sm text-app-muted divide-y divide-gray-200/50 dark:divide-[#222629]/50">
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">ID</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">{deviceId}</span>
                        <button onClick={() => { navigator.clipboard.writeText(deviceId); toast.success("Copied to clipboard"); }} className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"><Copy size={14} /></button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">Model</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">{deviceModel || "—"}</span>
                        <button onClick={() => { navigator.clipboard.writeText(deviceModel || "—"); toast.success("Copied to clipboard"); }} className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"><Copy size={14} /></button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">Connection</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">{connectionType || "—"}</span>
                        <button onClick={() => { navigator.clipboard.writeText(connectionType || "—"); toast.success("Copied to clipboard"); }} className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"><Copy size={14} /></button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">IP Address</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">{deviceIp || (connectionType === "USB" ? "N/A (USB)" : "—")}</span>
                        <button onClick={() => { navigator.clipboard.writeText(deviceIp || (connectionType === "USB" ? "N/A (USB)" : "—")); toast.success("Copied to clipboard"); }} className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"><Copy size={14} /></button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">Serial Number</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">{details ? details.serial : (isLoadingDetails ? "..." : "—")}</span>
                        <button onClick={() => { navigator.clipboard.writeText(details?.serial || "—"); toast.success("Copied to clipboard"); }} className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"><Copy size={14} /></button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">Android Version</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">{details ? details.android_version : (isLoadingDetails ? "..." : "—")}</span>
                        <button onClick={() => { navigator.clipboard.writeText(details?.android_version || "—"); toast.success("Copied to clipboard"); }} className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"><Copy size={14} /></button>
                      </div>
                      <div className="flex items-center justify-between px-5 py-3 hover:bg-app-hover/50 transition-colors group">
                        <span className="w-1/3">Manufacturer</span>
                        <span className="flex-1 font-mono text-[#cbd5e1] text-[13px]">{details ? details.manufacturer : (isLoadingDetails ? "..." : "—")}</span>
                        <button onClick={() => { navigator.clipboard.writeText(details?.manufacturer || "—"); toast.success("Copied to clipboard"); }} className="p-1.5 text-app-muted opacity-0 group-hover:opacity-100 hover:text-cyan-400 transition-all rounded-md hover:bg-cyan-500/10 active:scale-95"><Copy size={14} /></button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        )}

        {status === "connecting" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-app-card/90 dark:bg-[#0e1012]/90 z-10 text-center p-6 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-full border-2 border-cyan-500/20 border-t-cyan-500 animate-spin mb-4" />
            <p className="text-app-text font-medium text-sm">Starting mirror…</p>
            <p className="text-app-muted text-xs mt-1">Pushing server and initializing decoder</p>
          </div>
        )}

        {status === "error" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-app-card/95 dark:bg-[#0e1012]/95 z-10 text-center p-6 backdrop-blur-sm">
            <div className="w-12 h-12 rounded-full border-2 border-amber-500/20 border-t-amber-500 animate-spin mb-4" />
            <p className="text-app-text font-semibold text-base mb-1">Reconnecting…</p>
            <p className="text-amber-600 dark:text-amber-400 text-xs max-w-md mb-3">
              {errorMsg || "Connection interrupted"}
            </p>
            <button
              onClick={() => {
                if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
                isStoppedByUserRef.current = false;
                handleStart();
              }}
              className="px-4 py-2 bg-app-input hover:bg-app-hover text-app-text rounded-lg text-xs font-medium transition-colors border border-app-border"
            >
              Retry Now
            </button>
          </div>
        )}

        <canvas
          ref={canvasRef}
          onMouseDown={(e) => handleCanvasMouseEvent(e, "down")}
          onMouseMove={(e) => handleCanvasMouseEvent(e, "move")}
          onMouseUp={(e) => handleCanvasMouseEvent(e, "up")}
          onMouseLeave={(e) => handleCanvasMouseEvent(e, "up")}
          onWheel={handleWheel}
          className="max-w-full max-h-full w-auto h-auto object-contain transition-opacity duration-200"
          style={{
            opacity: status === "streaming" ? 1 : 0.2,
            // Prefer filling available height in portrait; width in landscape
            maxHeight: "100%",
            maxWidth: "100%",
          }}
        />
      </div>

      {/* Right Action Toolbar */}
      {status === "streaming" && (
        <aside
          className={`flex-shrink-0 bg-app-sidebar border-app-border flex flex-col gap-2 overflow-y-auto ${
            isLandscape
              ? "w-full max-h-16 border-t flex-row items-center justify-center px-3 py-1.5"
              : "w-[68px] border-l px-2 py-3"
          }`}
        >
          {/* Action Buttons */}
          <div
            className={`flex flex-col gap-1.5 flex-1 overflow-y-auto ${
              isLandscape ? "flex-row items-center flex-wrap justify-center" : ""
            }`}
          >
            {(
              [
                { key: 4, icon: ArrowLeft, label: "Back" },
                { key: 3, icon: Home, label: "Home" },
                { key: 187, icon: Layers, label: "Recent" },
                { key: 24, icon: Volume2, label: "Vol+" },
                { key: 25, icon: VolumeX, label: "Vol-" },
                { key: 26, icon: Power, label: "Power" },
              ] as const
            ).map(({ key, icon: Icon, label }) => (
              <button
                key={key}
                onClick={() => sendNavigationKey(key)}
                title={label}
                className="w-full flex items-center justify-center py-2 rounded-lg bg-app-input border border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40 transition-colors flex-shrink-0"
              >
                <Icon size={18} className="text-app-muted hover:text-app-text transition-colors" />
              </button>
            ))}

            <div className={isLandscape ? "w-px h-6 bg-app-border mx-1" : "h-px bg-app-border my-0.5 flex-shrink-0"} />

            {/* Pop Out */}
            {!isPopup && (
              <button
                onClick={async () => {
                  const handlePopOut = async () => {
                    await handleStop();
                    try {
                      await scrcpyService.openMirrorWindow(deviceId, deviceName);
                      setIsPoppedOut(true);
                    } catch (err) {
                      console.error("Failed to open mirror window:", err);
                      toastRef.current.error("Failed to open mirror window.");
                    }
                  };
                  handlePopOut();
                }}
                title="Pop out in separate window"
                className="w-full flex items-center justify-center py-2 rounded-lg bg-app-input border border-app-border text-app-text hover:bg-app-hover hover:border-cyan-500/40 transition-colors flex-shrink-0"
              >
                <ExternalLink size={18} className="text-app-muted hover:text-app-text transition-colors" />
              </button>
            )}

            {/* Stop */}
            <button
              onClick={handleStop}
              title="Stop Mirroring"
              className="w-full flex items-center justify-center py-2 rounded-lg bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/20 transition-colors flex-shrink-0"
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
                title="Close"
                className="w-full flex items-center justify-center py-1.5 rounded-lg text-app-muted hover:text-app-text hover:bg-app-hover transition-colors text-base flex-shrink-0"
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
