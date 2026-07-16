import { useState, useEffect, useRef, useCallback } from "react";
import { Channel } from "@tauri-apps/api/core";
import { scrcpyService } from "../services";
import type { FrameEvent } from "../types/tauri-commands";


// Base64 helper
function b64ToBytes(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

interface UseMirrorDecoderProps {
  deviceId: string;
  autoStart?: boolean;
  isPopup?: boolean;
  onTransportChange?: (transportId: string) => void;
  toast: {
    error: (msg: string) => void;
    success: (msg: string) => void;
  };
}

export type MirrorStatus = "idle" | "connecting" | "streaming" | "error";

export function useMirrorDecoder({
  deviceId,
  autoStart = false,
  isPopup = false,
  onTransportChange,
  toast,
}: UseMirrorDecoderProps) {
  const [status, setStatus] = useState<MirrorStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isAutoRetrying, setIsAutoRetrying] = useState(false);
  const [effectiveTransportId, setEffectiveTransportId] = useState(deviceId);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isPoppedOut, setIsPoppedOut] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const pendingFrame = useRef<VideoFrame | null>(null);
  const rafId = useRef<number>(0);
  const transportRef = useRef(deviceId);

  const isMountedRef = useRef(true);
  const isStoppedByUserRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryScheduledRef = useRef(false);
  const connectGenRef = useRef(0);
  const connectingRef = useRef(false);
  const retryCountRef = useRef(0);
  const MAX_AUTO_RETRIES = 3;

  // Sync refs with state changes
  useEffect(() => {
    transportRef.current = effectiveTransportId;
  }, [effectiveTransportId]);

  useEffect(() => {
    setEffectiveTransportId(deviceId);
    retryCountRef.current = 0;
  }, [deviceId]);

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
    connectGenRef.current += 1;
    connectingRef.current = false;
    retryScheduledRef.current = false;
    clearRetryTimer();
    cleanupDecoder();
    setStatus("idle");
    setIsPoppedOut(false);
    try {
      await scrcpyService.disconnectEmbeddedMirror(transportRef.current);
    } catch (err) {
      console.error("Disconnect error:", err);
    }
  }, [cleanupDecoder, clearRetryTimer]);

  const handleStart = useCallback(async () => {
    if (!isMountedRef.current || isStoppedByUserRef.current) return;
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

    const scheduleRetry = (message: string, delayMs: number) => {
      if (!isCurrent() || retryScheduledRef.current) return;
      retryScheduledRef.current = true;
      retryCountRef.current++;
      if (retryCountRef.current > MAX_AUTO_RETRIES) {
        setErrorMsg(message);
        setStatus("error");
        setIsAutoRetrying(false);
        retryScheduledRef.current = false;
        return;
      }

      setIsAutoRetrying(true);
      setStatus("connecting");
      clearRetryTimer();
      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        retryScheduledRef.current = false;
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
                  if (!canvas) {
                    f.close();
                    return;
                  }
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
              scheduleRetry(e.message || "Video decoder error", 2500);
            },
          });

          decoderRef.current = decoder;

          const config: VideoDecoderConfig = {
            codec: msg.data.codec,
            description,
            hardwareAcceleration: "prefer-hardware",
          };

          VideoDecoder.isConfigSupported(config)
            .then((result) => {
              if (!isCurrent()) return;
              if (!result.supported) {
                toast.error(`Codec ${msg.data.codec} is not supported on your hardware.`);
                setStatus("error");
                scrcpyService.disconnectEmbeddedMirror(transportRef.current).catch(() => {});
                return;
              }
              decoder.configure(config);
              retryCountRef.current = 0;
              setIsAutoRetrying(false);
              setStatus("streaming");
            })
            .catch((err) => {
              scheduleRetry(err instanceof Error ? err.message : "Video configuration failed", 2500);
            });
        } else if (msg.event === "packet") {
          const decoder = decoderRef.current;
          if (!decoder || decoder.state !== "configured") return;
          const bytes = b64ToBytes(msg.data.data);
          decoder.decode(
            new EncodedVideoChunk({
              type: msg.data.key ? "key" : "delta",
              timestamp: msg.data.timestamp,
              data: bytes,
            })
          );
        } else if (msg.event === "disconnected") {
          cleanupDecoder();
          if (!isCurrent()) return;
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
          scheduleRetry(reason, 2000);
        }
      };

      const [w, h] = await scrcpyService.connectEmbeddedMirror(transportRef.current, channel, {
        max_size: 1080,
        max_fps: 60,
        video_bit_rate: 8000000,
        video_codec: "h264",
        audio: false,
      });

      if (!isCurrent()) return;
      setDimensions({ width: w, height: h });
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
    } catch (err: any) {
      if (!isCurrent()) return;
      cleanupDecoder();
      scheduleRetry(typeof err === "string" ? err : err.message || "Failed to start embedded stream", 2500);
    } finally {
      if (connectGenRef.current === gen) {
        connectingRef.current = false;
      }
    }
  }, [cleanupDecoder, clearRetryTimer, toast, isPopup]);

  const switchTransport = useCallback(
    async (newTransportId: string) => {
      isStoppedByUserRef.current = true;
      connectGenRef.current += 1;
      connectingRef.current = false;
      retryScheduledRef.current = false;
      clearRetryTimer();
      cleanupDecoder();
      try {
        await scrcpyService.disconnectEmbeddedMirror(transportRef.current);
      } catch {
        // ignore cleanup errors
      }
      transportRef.current = newTransportId;
      setEffectiveTransportId(newTransportId);
      onTransportChange?.(newTransportId);
      setStatus("idle");
    },
    [cleanupDecoder, clearRetryTimer, onTransportChange]
  );

  const startMirroring = useCallback(() => {
    isStoppedByUserRef.current = false;
    void handleStart();
  }, [handleStart]);

  const retryMirroring = useCallback(() => {
    clearRetryTimer();
    retryCountRef.current = 0;
    retryScheduledRef.current = false;
    setIsAutoRetrying(false);
    isStoppedByUserRef.current = false;
    void handleStart();
  }, [clearRetryTimer, handleStart]);

  const cancelRetry = useCallback(() => {
    clearRetryTimer();
    retryScheduledRef.current = false;
    setIsAutoRetrying(false);
    retryCountRef.current = 0;
    setErrorMsg("Auto-retry cancelled");
    setStatus("error");
  }, [clearRetryTimer]);

  useEffect(() => {
    isMountedRef.current = true;
    if (isPopup || autoStart) {
      isStoppedByUserRef.current = false;
      void handleStart();
    } else {
      isStoppedByUserRef.current = true;
    }

    return () => {
      isMountedRef.current = false;
      connectGenRef.current += 1;
      connectingRef.current = false;
      retryScheduledRef.current = false;
      clearRetryTimer();
      cleanupDecoder();
      scrcpyService.disconnectEmbeddedMirror(transportRef.current).catch(() => {});
    };
  }, [deviceId, cleanupDecoder, clearRetryTimer, isPopup, autoStart, handleStart]);

  return {
    status,
    setStatus,
    errorMsg,
    setErrorMsg,
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
  };
}
