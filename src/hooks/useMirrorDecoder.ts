import { useState, useEffect, useRef, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Channel } from "@tauri-apps/api/core";
import { scrcpyService, windowService } from "../services";
import type { FrameEvent } from "../types/tauri-commands";
import {
  classifyMirrorError,
  type ErrorClassification,
} from "../utils/errorClassifier";

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

type HwPreference = "prefer-hardware" | "prefer-software" | "no-preference";

interface QueuedPacket {
  key: boolean;
  timestamp: number;
  data: Uint8Array;
}

const RETRY_DELAYS_MS = [1500, 3000, 5000];
const MAX_AUTO_RETRIES = 3;

export function useMirrorDecoder({
  deviceId,
  autoStart = false,
  isPopup = false,
  onTransportChange,
  toast,
}: UseMirrorDecoderProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<MirrorStatus>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [classifiedError, setClassifiedError] =
    useState<ErrorClassification | null>(null);
  const [isAutoRetrying, setIsAutoRetrying] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(0);
  const [retryAttempt, setRetryAttempt] = useState(0);
  const [effectiveTransportId, setEffectiveTransportId] = useState(deviceId);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [isPoppedOut, setIsPoppedOut] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const decoderRef = useRef<VideoDecoder | null>(null);
  const pendingFrame = useRef<VideoFrame | null>(null);
  const pendingPackets = useRef<QueuedPacket[]>([]);
  const isConfiguringRef = useRef<boolean>(false);
  const currentConfigRef = useRef<VideoDecoderConfig | null>(null);
  const preferredHwRef = useRef<HwPreference>("prefer-hardware");

  const rafId = useRef<number>(0);
  const transportRef = useRef(deviceId);
  const statusRef = useRef<MirrorStatus>(status);

  const isMountedRef = useRef(true);
  const isStoppedByUserRef = useRef(false);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const retryScheduledRef = useRef(false);
  const connectGenRef = useRef(0);
  const connectingRef = useRef(false);
  const retryCountRef = useRef(0);

  // Sync refs with state changes
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    transportRef.current = effectiveTransportId;
  }, [effectiveTransportId]);

  useEffect(() => {
    setEffectiveTransportId(deviceId);
    retryCountRef.current = 0;
    setRetryAttempt(0);
    setRetryCountdown(0);
  }, [deviceId]);


  // Cleanly teardown decoder, cancel RAF, release any pending VideoFrame and buffers
  const cleanupDecoder = useCallback(() => {
    // 1. Cancel in-flight RAF
    if (rafId.current) {
      cancelAnimationFrame(rafId.current);
      rafId.current = 0;
    }
    // 2. Explicitly close any pending VideoFrame waiting to render
    if (pendingFrame.current) {
      try {
        pendingFrame.current.close();
      } catch {
        // Ignore if already closed
      }
      pendingFrame.current = null;
    }
    // 3. Close the active VideoDecoder instance
    if (decoderRef.current) {
      if (decoderRef.current.state !== "closed") {
        try {
          decoderRef.current.close();
        } catch {
          // Ignore if close throws
        }
      }
      decoderRef.current = null;
    }
    // 4. Clear pending packet buffers and configuring state
    pendingPackets.current = [];
    isConfiguringRef.current = false;
    currentConfigRef.current = null;
    ctxRef.current = null;
  }, []);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
  }, []);

  // Frame render pipeline: handles RAF paint with guaranteed frame closure under all branches
  const scheduleRender = useCallback(() => {
    if (rafId.current) return;

    rafId.current = requestAnimationFrame(() => {
      rafId.current = 0;
      const frameToRender = pendingFrame.current;
      pendingFrame.current = null;

      if (!frameToRender) return;

      try {
        // Check if stream is still active and component is mounted
        if (!isMountedRef.current || isStoppedByUserRef.current) {
          return;
        }

        const canvas = canvasRef.current;
        if (!canvas) {
          return;
        }

        const dw = frameToRender.displayWidth;
        const dh = frameToRender.displayHeight;

        // Auto-update canvas dimensions on orientation / resolution changes
        if (canvas.width !== dw || canvas.height !== dh) {
          canvas.width = dw;
          canvas.height = dh;
          ctxRef.current = null; // Invalidate cached context on size change
          setDimensions({ width: dw, height: dh });
        }

        if (!ctxRef.current) {
          ctxRef.current = canvas.getContext("2d", {
            alpha: false,
            desynchronized: true,
          });
        }

        const ctx = ctxRef.current;
        if (ctx) {
          ctx.drawImage(frameToRender, 0, 0);
        }
      } catch (err) {
        console.warn("Canvas frame render error:", err);
      } finally {
        // Guarantee VideoFrame is closed to eliminate GPU memory leaks
        try {
          frameToRender.close();
        } catch {
          // Ignore if already closed
        }
      }
    });
  }, []);

  // When window visibility changes or window is focused, immediately schedule a paint if a frame is pending
  useEffect(() => {
    const handleVisibilityOrFocus = () => {
      if (
        document.visibilityState === "visible" &&
        pendingFrame.current &&
        !rafId.current
      ) {
        scheduleRender();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityOrFocus);
    window.addEventListener("focus", handleVisibilityOrFocus);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityOrFocus);
      window.removeEventListener("focus", handleVisibilityOrFocus);
    };
  }, [scheduleRender]);

  // Output callback for VideoDecoder: drops stale frames on throttled RAF and guarantees closure
  const handleDecoderOutput = useCallback(
    (frame: VideoFrame, gen: number) => {
      if (
        !isMountedRef.current ||
        isStoppedByUserRef.current ||
        connectGenRef.current !== gen
      ) {
        try {
          frame.close();
        } catch {}
        return;
      }

      // If an older frame was waiting for RAF, close it immediately before replacing
      if (pendingFrame.current) {
        try {
          pendingFrame.current.close();
        } catch {}
        pendingFrame.current = null;
      }

      pendingFrame.current = frame;
      scheduleRender();
    },
    [scheduleRender],
  );

  // Queue packets when decoder is in unconfigured or configuring state
  const queuePacket = useCallback(
    (key: boolean, timestamp: number, data: Uint8Array) => {
      // Delta packets arriving before any keyframe are discarded because they cannot be decoded
      if (!key && !pendingPackets.current.some((p) => p.key)) {
        return;
      }

      // If a newer keyframe arrives while buffering, discard older stale packets to decode fresh
      if (key) {
        pendingPackets.current = [{ key, timestamp, data }];
        return;
      }

      // Keep a bounded queue (max 30 frames ~ 0.5s @ 60fps)
      if (pendingPackets.current.length < 30) {
        pendingPackets.current.push({ key, timestamp, data });
      }
    },
    [],
  );

  // Drain queued packets starting strictly from the first keyframe
  const drainQueuedPackets = useCallback((decoder: VideoDecoder) => {
    if (decoder.state !== "configured") return;
    const packets = pendingPackets.current.splice(0);
    const firstKeyIdx = packets.findIndex((p) => p.key);
    if (firstKeyIdx === -1) return;

    const validSequence = packets.slice(firstKeyIdx);
    for (const pkt of validSequence) {
      try {
        decoder.decode(
          new EncodedVideoChunk({
            type: pkt.key ? "key" : "delta",
            timestamp: pkt.timestamp,
            data: pkt.data,
          }),
        );
      } catch (err) {
        console.warn("Failed to decode queued chunk:", err);
      }
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
    setIsAutoRetrying(false);
    setRetryCountdown(0);
    setRetryAttempt(0);
    setErrorMsg(null);
    setClassifiedError(null);
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
    setClassifiedError(null);
    setIsPoppedOut(false);

    const isCurrent = () =>
      isMountedRef.current &&
      !isStoppedByUserRef.current &&
      connectGenRef.current === gen;

    const handleFailure = (rawError: unknown, defaultMsg: string) => {
      if (!isCurrent()) return;
      const classification = classifyMirrorError(rawError, defaultMsg);
      setClassifiedError(classification);
      setErrorMsg(classification.message);

      // Fatal / Permanent error: Halt retries immediately and display resolution
      if (classification.isFatal) {
        clearRetryTimer();
        retryScheduledRef.current = false;
        setIsAutoRetrying(false);
        setRetryCountdown(0);
        setStatus("error");
        cleanupDecoder();
        scrcpyService
          .disconnectEmbeddedMirror(transportRef.current)
          .catch(() => {});
        return;
      }

      // Transient error: Check retry budget
      if (retryScheduledRef.current) return;

      if (retryCountRef.current >= MAX_AUTO_RETRIES) {
        clearRetryTimer();
        retryScheduledRef.current = false;
        setIsAutoRetrying(false);
        setRetryCountdown(0);
        setStatus("error");
        cleanupDecoder();
        return;
      }

      retryScheduledRef.current = true;
      retryCountRef.current++;
      setRetryAttempt(retryCountRef.current);
      setIsAutoRetrying(true);
      setStatus("connecting");

      const delayIndex = Math.min(
        retryCountRef.current - 1,
        RETRY_DELAYS_MS.length - 1,
      );
      const delayMs = RETRY_DELAYS_MS[delayIndex] || 3000;
      const totalSeconds = Math.max(1, Math.round(delayMs / 1000));
      setRetryCountdown(totalSeconds);

      clearRetryTimer();

      let remainingSec = totalSeconds;
      countdownIntervalRef.current = setInterval(() => {
        remainingSec -= 1;
        if (remainingSec <= 0) {
          if (countdownIntervalRef.current) {
            clearInterval(countdownIntervalRef.current);
            countdownIntervalRef.current = null;
          }
          setRetryCountdown(0);
        } else {
          setRetryCountdown(remainingSec);
        }
      }, 1000);

      retryTimerRef.current = setTimeout(() => {
        retryTimerRef.current = null;
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
        retryScheduledRef.current = false;
        setRetryCountdown(0);
        if (isCurrent()) {
          void handleStart();
        }
      }, delayMs);
    };

    // Helper to initialize or recreate decoder with hardware acceleration fallback
    const initDecoder = async (codec: string, description: ArrayBuffer) => {
      if (!isCurrent()) return;
      isConfiguringRef.current = true;

      // Check environment support
      if (typeof VideoDecoder === "undefined") {
        toast.error(
          "WebCodecs VideoDecoder is not supported in this environment.",
        );
        handleFailure(
          "WebCodecs VideoDecoder not supported",
          "WebCodecs VideoDecoder not supported",
        );
        isConfiguringRef.current = false;
        return;
      }

      // Try preferred hardware preference first, then fallback
      const preferences: HwPreference[] =
        preferredHwRef.current === "prefer-hardware"
          ? ["prefer-hardware", "prefer-software", "no-preference"]
          : ["prefer-software", "no-preference", "prefer-hardware"];

      let supportedConfig: VideoDecoderConfig | null = null;

      for (const hw of preferences) {
        const testConfig: VideoDecoderConfig = {
          codec,
          description,
          hardwareAcceleration: hw,
          optimizeForLatency: true,
        };
        try {
          const result = await VideoDecoder.isConfigSupported(testConfig);
          if (result.supported) {
            supportedConfig = testConfig;
            preferredHwRef.current = hw;
            break;
          }
        } catch {
          // Check next preference
        }
      }

      if (!isCurrent()) return;

      if (!supportedConfig) {
        toast.error(`Codec ${codec} is not supported on your system.`);
        handleFailure(
          `Codec ${codec} unsupported on your system`,
          `Codec ${codec} unsupported`,
        );
        isConfiguringRef.current = false;
        return;
      }

      // Clean up previous decoder instance if any
      if (decoderRef.current && decoderRef.current.state !== "closed") {
        try {
          decoderRef.current.close();
        } catch {}
        decoderRef.current = null;
      }

      try {
        const decoder = new VideoDecoder({
          output: (frame: VideoFrame) => {
            handleDecoderOutput(frame, gen);
          },
          error: (e: DOMException) => {
            console.error("VideoDecoder runtime error:", e);
            if (!isCurrent()) return;
            // If hardware decoder crashed, fallback to software for next retry
            if (preferredHwRef.current === "prefer-hardware") {
              preferredHwRef.current = "prefer-software";
            }
            handleFailure(
              e.message || "Video decoder runtime error",
              "Video decoder runtime error",
            );
          },
        });

        decoder.configure(supportedConfig);
        decoderRef.current = decoder;
        currentConfigRef.current = supportedConfig;
        isConfiguringRef.current = false;

        // Drain queued packets starting from keyframe
        drainQueuedPackets(decoder);

        retryCountRef.current = 0;
        setRetryAttempt(0);
        setRetryCountdown(0);
        setIsAutoRetrying(false);
        setStatus("streaming");
      } catch (err: any) {
        isConfiguringRef.current = false;
        console.error("Failed to configure VideoDecoder:", err);
        handleFailure(err, "Video decoder configuration failed");
      }
    };

    try {
      const channel = new Channel<FrameEvent>();
      channel.onmessage = (msg) => {
        if (!isCurrent()) return;

        if (msg.event === "config") {
          const descBytes = b64ToBytes(msg.data.description);
          const description = descBytes.buffer.slice(
            descBytes.byteOffset,
            descBytes.byteOffset + descBytes.byteLength,
          );
          const codec = msg.data.codec;

          // If decoder already exists and is configured, attempt seamless in-place reconfiguration
          if (
            decoderRef.current &&
            decoderRef.current.state === "configured" &&
            !isConfiguringRef.current
          ) {
            try {
              const config: VideoDecoderConfig = {
                codec,
                description,
                hardwareAcceleration: preferredHwRef.current,
                optimizeForLatency: true,
              };
              decoderRef.current.configure(config);
              currentConfigRef.current = config;
              retryCountRef.current = 0;
              setRetryAttempt(0);
              setRetryCountdown(0);
              setIsAutoRetrying(false);
              setStatus("streaming");
              return;
            } catch (err) {
              console.warn(
                "In-place decoder reconfiguration failed, recreating decoder:",
                err,
              );
            }
          }

          // Otherwise initialize a fresh decoder
          void initDecoder(codec, description);
        } else if (msg.event === "packet") {
          const decoder = decoderRef.current;
          const bytes = b64ToBytes(msg.data.data);
          const isKey = !!msg.data.key;
          const timestamp = msg.data.timestamp;

          if (
            !decoder ||
            decoder.state !== "configured" ||
            isConfiguringRef.current
          ) {
            queuePacket(isKey, timestamp, bytes);
            return;
          }

          try {
            decoder.decode(
              new EncodedVideoChunk({
                type: isKey ? "key" : "delta",
                timestamp,
                data: bytes,
              }),
            );
          } catch (err: any) {
            console.warn("VideoDecoder decode error:", err);
            const currentState = (decoder as VideoDecoder).state as CodecState;
            if (currentState === "closed") {
              handleFailure(
                "Decoder closed unexpectedly during decode",
                "Video decoding failed",
              );
            }
          }
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
          handleFailure(reason, "Stream disconnected unexpectedly");
        }
      };

      const [w, h] = await scrcpyService.connectEmbeddedMirror(
        transportRef.current,
        channel,
        {
          max_size: 1080,
          max_fps: 60,
          video_bit_rate: 8000000,
          video_codec: "h264",
          audio: false,
        },
      );

      if (!isCurrent()) return;
      setDimensions({ width: w, height: h });
      if (canvasRef.current) {
        canvasRef.current.width = w;
        canvasRef.current.height = h;
      }
    } catch (err: any) {
      if (!isCurrent()) return;
      cleanupDecoder();
      handleFailure(err, "Failed to start embedded stream");
    } finally {
      if (connectGenRef.current === gen) {
        connectingRef.current = false;
      }
    }
  }, [
    cleanupDecoder,
    clearRetryTimer,
    toast,
    isPopup,
    handleDecoderOutput,
    queuePacket,
    drainQueuedPackets,
  ]);

  const switchTransport = useCallback(
    async (newTransportId: string, autoConnect?: boolean) => {
      const shouldConnect =
        autoConnect ??
        (statusRef.current === "streaming" ||
          statusRef.current === "connecting" ||
          statusRef.current === "error");

      isStoppedByUserRef.current = !shouldConnect;
      connectGenRef.current += 1;
      connectingRef.current = false;
      retryScheduledRef.current = false;
      clearRetryTimer();
      cleanupDecoder();

      // Completely tear down old transport session first
      const oldTransport = transportRef.current;
      if (oldTransport) {
        try {
          await scrcpyService.disconnectEmbeddedMirror(oldTransport);
        } catch (err) {
          console.warn("Teardown error during transport switch:", err);
        }
      }

      transportRef.current = newTransportId;
      setEffectiveTransportId(newTransportId);
      retryCountRef.current = 0;
      setRetryAttempt(0);
      setRetryCountdown(0);
      setClassifiedError(null);
      setErrorMsg(null);
      onTransportChange?.(newTransportId);

      if (shouldConnect) {
        void handleStart();
      } else {
        setStatus("idle");
      }
    },
    [cleanupDecoder, clearRetryTimer, onTransportChange, handleStart],
  );

  const startMirroring = useCallback(() => {
    isStoppedByUserRef.current = false;
    retryCountRef.current = 0;
    setRetryAttempt(0);
    setRetryCountdown(0);
    setClassifiedError(null);
    setErrorMsg(null);
    void handleStart();
  }, [handleStart]);

  const retryMirroring = useCallback(() => {
    clearRetryTimer();
    retryCountRef.current = 0;
    setRetryAttempt(0);
    setRetryCountdown(0);
    retryScheduledRef.current = false;
    setIsAutoRetrying(false);
    isStoppedByUserRef.current = false;
    setClassifiedError(null);
    setErrorMsg(null);
    void handleStart();
  }, [clearRetryTimer, handleStart]);

  const cancelRetry = useCallback(() => {
    isStoppedByUserRef.current = true;
    connectGenRef.current += 1;
    clearRetryTimer();
    retryScheduledRef.current = false;
    setIsAutoRetrying(false);
    setRetryCountdown(0);
    retryCountRef.current = 0;
    setRetryAttempt(0);
    setErrorMsg(t("mirror.auto_retry_cancelled"));
    setClassifiedError({
      isFatal: false,
      category: "transient",
      title: t("mirror.retry_cancelled_title"),
      message: t("mirror.retry_cancelled_message"),
      resolution: t("mirror.retry_cancelled_resolution"),
    });
    setStatus("error");
  }, [clearRetryTimer, t]);

  const popOutMirror = useCallback(
    async (deviceName: string) => {
      if (isPopup) return;
      // 1. Completely stop and tear down inline decoder first
      await handleStop();
      // 2. Open dedicated popout window
      try {
        await windowService.openMirrorWindow(transportRef.current, deviceName);
        setIsPoppedOut(true);
      } catch (err) {
        console.error("Failed to open mirror window:", err);
        toast.error("Failed to open mirror window.");
      }
    },
    [isPopup, handleStop, toast],
  );

  const bringMirrorBack = useCallback(async () => {
    try {
      await windowService.closeMirrorWindow(transportRef.current);
    } catch (err) {
      console.warn("Failed to close mirror window via service:", err);
    }
    setIsPoppedOut(false);
    isStoppedByUserRef.current = false;
    retryCountRef.current = 0;
    setRetryAttempt(0);
    setRetryCountdown(0);
    setClassifiedError(null);
    setErrorMsg(null);
    // Reconnection is started by the mirror-window-closed listener when the
    // backend destroys the mirror window (single source of the close event),
    // so no direct handleStart call here to avoid a duplicate reconnect.
  }, []);

  const focusPopoutWindow = useCallback(async () => {
    try {
      await windowService.focusMirrorWindow(transportRef.current);
    } catch (err) {
      console.error("Failed to focus mirror window:", err);
      toast.error("Popout window not found");
    }
  }, [toast]);

  // Initial popout state check on mount or transport change
  useEffect(() => {
    let active = true;
    if (!isPopup) {
      windowService
        .isMirrorWindowOpen(effectiveTransportId)
        .then((isOpen) => {
          if (active && isOpen) {
            setIsPoppedOut(true);
          }
        })
        .catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [isPopup, effectiveTransportId]);

  // Listen for mirror window closed events to seamlessly restore inline stream
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;

    windowService
      .onMirrorWindowClosed(({ deviceId: closedId }) => {
        if (disposed) return;
        if (
          closedId === deviceId ||
          closedId === transportRef.current ||
          closedId === effectiveTransportId
        ) {
          setIsPoppedOut(false);
          // If in main window, automatically reconnect inline mirroring
          if (!isPopup && isMountedRef.current) {
            isStoppedByUserRef.current = false;
            retryCountRef.current = 0;
            setRetryAttempt(0);
            setRetryCountdown(0);
            setClassifiedError(null);
            setErrorMsg(null);
            void handleStart();
          }
        }
      })
      .then((un) => {
        if (disposed) {
          un();
        } else {
          unlisten = un;
        }
      })
      .catch((err) => {
        console.error("Failed to register mirror-window-closed listener:", err);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [deviceId, effectiveTransportId, isPopup, handleStart]);

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
      scrcpyService
        .disconnectEmbeddedMirror(transportRef.current)
        .catch(() => {});
    };
  }, [
    deviceId,
    cleanupDecoder,
    clearRetryTimer,
    isPopup,
    autoStart,
    handleStart,
  ]);

  return {
    status,
    setStatus,
    errorMsg,
    setErrorMsg,
    classifiedError,
    setClassifiedError,
    isAutoRetrying,
    setIsAutoRetrying,
    retryCountdown,
    retryAttempt,
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
    popOutMirror,
    bringMirrorBack,
    focusPopoutWindow,
  };
}
