import { useRef, useEffect, useCallback } from "react";
import { scrcpyService } from "../services";

export interface VideoRect {
  left: number;
  top: number;
  width: number;
  height: number;
  scale: number;
}

export interface NormalizedPoint {
  /** Normalized X coordinate in 0.0..=1.0 */
  x: number;
  /** Normalized Y coordinate in 0.0..=1.0 */
  y: number;
  /** Whether the coordinate lies strictly inside the active video viewport */
  inside: boolean;
}

/**
 * Android Keycode mapping for special non-printable and navigation keys
 */
export const ANDROID_KEYCODES = {
  HOME: 3,
  BACK: 4,
  DPAD_UP: 19,
  DPAD_DOWN: 20,
  DPAD_LEFT: 21,
  DPAD_RIGHT: 22,
  VOLUME_UP: 24,
  VOLUME_DOWN: 25,
  POWER: 26,
  TAB: 61,
  SPACE: 62,
  ENTER: 66,
  DEL: 67, // Backspace
  PAGE_UP: 92,
  PAGE_DOWN: 93,
  ESCAPE: 111,
  FORWARD_DEL: 112, // Delete
  MOVE_HOME: 122,
  MOVE_END: 123,
  APP_SWITCH: 187, // Recents
} as const;

/**
 * Map DOM keyboard event `key` names to Android keycodes.
 */
export const SPECIAL_KEY_MAP: Record<string, number> = {
  Enter: ANDROID_KEYCODES.ENTER,
  Backspace: ANDROID_KEYCODES.DEL,
  Delete: ANDROID_KEYCODES.FORWARD_DEL,
  ArrowUp: ANDROID_KEYCODES.DPAD_UP,
  ArrowDown: ANDROID_KEYCODES.DPAD_DOWN,
  ArrowLeft: ANDROID_KEYCODES.DPAD_LEFT,
  ArrowRight: ANDROID_KEYCODES.DPAD_RIGHT,
  Escape: ANDROID_KEYCODES.BACK, // Map Escape to Android Back for intuitive behavior
  Tab: ANDROID_KEYCODES.TAB,
  Home: ANDROID_KEYCODES.MOVE_HOME,
  End: ANDROID_KEYCODES.MOVE_END,
  PageUp: ANDROID_KEYCODES.PAGE_UP,
  PageDown: ANDROID_KEYCODES.PAGE_DOWN,
};

/** Pixels of accumulated wheel delta that equal one scrcpy scroll tick. */
export const SCROLL_TICK_THRESHOLD = 20;

/**
 * Convert accumulated wheel deltas into bounded scrcpy scroll ticks.
 * Mutates `acc` to leave the unused remainder below the tick threshold.
 */
export function computeScrollTicks(acc: { x: number; y: number }): {
  dx: number;
  dy: number;
} {
  let dx = 0;
  let dy = 0;
  if (Math.abs(acc.x) >= SCROLL_TICK_THRESHOLD) {
    const ticksX = Math.trunc(acc.x / SCROLL_TICK_THRESHOLD);
    dx = Math.max(-16, Math.min(16, -ticksX));
    acc.x -= ticksX * SCROLL_TICK_THRESHOLD;
  }
  if (Math.abs(acc.y) >= SCROLL_TICK_THRESHOLD) {
    const ticksY = Math.trunc(acc.y / SCROLL_TICK_THRESHOLD);
    dy = Math.max(-16, Math.min(16, -ticksY));
    acc.y -= ticksY * SCROLL_TICK_THRESHOLD;
  }
  return { dx, dy };
}

export interface MirrorKeyModifiers {
  isHostShortcut: boolean;
  isPaste: boolean;
  isNavShortcut: boolean;
}

/**
 * Classify a key event so host shortcuts, paste, and Alt navigation
 * can be handled without colliding with injected Android keys.
 */
export function classifyKeyEvent(e: {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}): MirrorKeyModifiers {
  const isPaste =
    (e.metaKey || e.ctrlKey) &&
    !e.altKey &&
    !e.shiftKey &&
    e.key.toLowerCase() === "v";

  const isHostShortcut = !isPaste && (e.metaKey || (e.ctrlKey && !e.altKey));

  let isNavShortcut = false;
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    const k = e.key.toLowerCase();
    isNavShortcut =
      k === "b" ||
      k === "arrowleft" ||
      k === "h" ||
      k === "s" ||
      k === "r" ||
      k === "p" ||
      e.key === "ArrowUp" ||
      e.key === "ArrowDown";
  }

  return { isHostShortcut, isPaste, isNavShortcut };
}

/**
 * Calculates the exact active video rectangle within a canvas element,
 * accounting for CSS `object-fit: contain` letterboxing and intrinsic aspect ratio.
 */
export function calculateCanvasVideoRect(
  canvas: HTMLCanvasElement | null,
  intrinsicWidth: number,
  intrinsicHeight: number,
): VideoRect | null {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return null;

  const w = intrinsicWidth > 0 ? intrinsicWidth : canvas.width;
  const h = intrinsicHeight > 0 ? intrinsicHeight : canvas.height;
  if (w <= 0 || h <= 0) return null;

  const scale = Math.min(rect.width / w, rect.height / h);
  if (!Number.isFinite(scale) || scale <= 0) return null;

  const renderedWidth = w * scale;
  const renderedHeight = h * scale;
  const offsetX = (rect.width - renderedWidth) / 2;
  const offsetY = (rect.height - renderedHeight) / 2;

  return {
    left: rect.left + offsetX,
    top: rect.top + offsetY,
    width: renderedWidth,
    height: renderedHeight,
    scale,
  };
}

/**
 * Normalizes client coordinates (clientX, clientY) into 0.0..=1.0 normalized coordinates
 * within the active video area of the canvas.
 */
export function normalizeCoordinates(
  clientX: number,
  clientY: number,
  canvas: HTMLCanvasElement | null,
  intrinsicWidth: number,
  intrinsicHeight: number,
): NormalizedPoint {
  const videoRect = calculateCanvasVideoRect(
    canvas,
    intrinsicWidth,
    intrinsicHeight,
  );
  if (!videoRect || videoRect.width <= 0 || videoRect.height <= 0) {
    return { x: 0, y: 0, inside: false };
  }

  const contentX = clientX - videoRect.left;
  const contentY = clientY - videoRect.top;

  const normX = contentX / videoRect.width;
  const normY = contentY / videoRect.height;

  const inside =
    contentX >= 0 &&
    contentX <= videoRect.width &&
    contentY >= 0 &&
    contentY <= videoRect.height;

  const clampedX = Math.max(0, Math.min(1, normX));
  const clampedY = Math.max(0, Math.min(1, normY));

  return {
    x: Number.isFinite(clampedX) ? clampedX : 0,
    y: Number.isFinite(clampedY) ? clampedY : 0,
    inside,
  };
}

export interface UseMirrorInputOptions {
  /** Target device or transport ID to send control messages to */
  transportId: string;
  /** Active stream status */
  status: string;
  /** Video frame dimensions */
  dimensions: { width: number; height: number };
  /** Ref to the HTMLCanvasElement rendering the stream */
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  /** Optional container element ref for focus tracking */
  containerRef?: React.RefObject<HTMLElement | null>;
  /** Whether keyboard shortcuts (Alt+B, Alt+H, etc.) are globally active */
  enableShortcuts?: boolean;
}

export interface CanvasPointerHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerCancel: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onLostPointerCapture: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onWheel: (e: React.WheelEvent<HTMLCanvasElement>) => void;
  onContextMenu: (e: React.MouseEvent<HTMLCanvasElement>) => void;
}

export interface ContainerKeyHandlers {
  tabIndex: number;
  onKeyDown: (e: React.KeyboardEvent<HTMLElement>) => void;
  onCompositionStart: (e: React.CompositionEvent<HTMLElement>) => void;
  onCompositionEnd: (e: React.CompositionEvent<HTMLElement>) => void;
}

export interface UseMirrorInputReturn {
  /** Event handlers to attach to the <canvas> element */
  canvasProps: CanvasPointerHandlers;
  /** Event handlers to attach to the container element for keyboard/IME focus */
  containerProps: ContainerKeyHandlers;
  /** Helper to send special navigation keycodes programmatically */
  sendNavigationKey: (keycode: number) => Promise<void>;
  /** Helper to send arbitrary text string to the device */
  sendText: (text: string) => Promise<void>;
  /** Helper to get current active video rect */
  getVideoRect: () => VideoRect | null;
  /** Helper to normalize any mouse/pointer/wheel event to [0..1] coordinates */
  normalizePointerEvent: (
    e:
      | React.MouseEvent
      | React.PointerEvent
      | React.WheelEvent
      | MouseEvent
      | PointerEvent
      | WheelEvent,
  ) => NormalizedPoint;
}

export function useMirrorInput({
  transportId,
  status,
  dimensions,
  canvasRef,
  containerRef,
  enableShortcuts = true,
}: UseMirrorInputOptions): UseMirrorInputReturn {
  const statusRef = useRef(status);
  statusRef.current = status;

  const transportRef = useRef(transportId);
  transportRef.current = transportId;

  const dimensionsRef = useRef(dimensions);
  dimensionsRef.current = dimensions;

  // Pointer tracking & drag state
  const activePointerIdRef = useRef<number | null>(null);
  const isDraggingRef = useRef(false);
  const latestMoveCoordRef = useRef<{ x: number; y: number } | null>(null);
  const rafMoveIdRef = useRef(0);

  // Wheel & scroll throttling state
  const wheelAccRef = useRef({ x: 0, y: 0 });
  const latestWheelPosRef = useRef({ x: 0.5, y: 0.5 });
  const rafWheelIdRef = useRef(0);
  const wheelDecayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // IME composition tracking
  const composingRef = useRef(false);

  // Cleanup all pending animation frames and timers on unmount / teardown
  const cleanupFrames = useCallback(() => {
    if (rafMoveIdRef.current) {
      cancelAnimationFrame(rafMoveIdRef.current);
      rafMoveIdRef.current = 0;
    }
    if (rafWheelIdRef.current) {
      cancelAnimationFrame(rafWheelIdRef.current);
      rafWheelIdRef.current = 0;
    }
    if (wheelDecayTimerRef.current) {
      clearTimeout(wheelDecayTimerRef.current);
      wheelDecayTimerRef.current = null;
    }
    isDraggingRef.current = false;
    activePointerIdRef.current = null;
    latestMoveCoordRef.current = null;
    wheelAccRef.current = { x: 0, y: 0 };
  }, []);

  useEffect(() => {
    return () => {
      cleanupFrames();
    };
  }, [cleanupFrames]);

  // When stream status changes from streaming to idle/error, reset pointer state
  useEffect(() => {
    if (status !== "streaming") {
      cleanupFrames();
    }
  }, [status, cleanupFrames]);

  const normalizePointerEvent = useCallback(
    (
      e:
        | React.MouseEvent
        | React.PointerEvent
        | React.WheelEvent
        | MouseEvent
        | PointerEvent
        | WheelEvent,
    ): NormalizedPoint => {
      return normalizeCoordinates(
        e.clientX,
        e.clientY,
        canvasRef.current,
        dimensionsRef.current.width,
        dimensionsRef.current.height,
      );
    },
    [canvasRef],
  );

  const getVideoRect = useCallback((): VideoRect | null => {
    return calculateCanvasVideoRect(
      canvasRef.current,
      dimensionsRef.current.width,
      dimensionsRef.current.height,
    );
  }, [canvasRef]);

  const sendNavigationKey = useCallback(
    async (keycode: number) => {
      if (statusRef.current !== "streaming") return;
      try {
        await scrcpyService.sendKey(transportRef.current, keycode, "down");
        await scrcpyService.sendKey(transportRef.current, keycode, "up");
      } catch {
        // Ignore transient control socket errors
      }
    },
    [],
  );

  const sendText = useCallback(
    async (text: string) => {
      if (statusRef.current !== "streaming" || !text) return;
      try {
        await scrcpyService.sendText(transportRef.current, text);
      } catch {
        // Ignore transient control socket errors
      }
    },
    [],
  );

  // Pointer event handlers
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (statusRef.current !== "streaming") return;

      // Secondary click (Right click) -> Send Android Back key
      if (e.button === 2) {
        e.preventDefault();
        e.stopPropagation();
        void sendNavigationKey(ANDROID_KEYCODES.BACK);
        return;
      }

      // Middle click -> Send Android Home key
      if (e.button === 1) {
        e.preventDefault();
        e.stopPropagation();
        void sendNavigationKey(ANDROID_KEYCODES.HOME);
        return;
      }

      // Only handle primary button (left-click / touch / pen)
      if (e.button !== 0 && e.pointerType === "mouse") {
        return;
      }

      // If a drag is already active from another pointer, ignore
      if (activePointerIdRef.current !== null) {
        return;
      }

      const { x, y, inside } = normalizePointerEvent(e);

      // Letterbox protection: Clicking in black bars should NEVER generate touch events
      if (!inside) {
        return;
      }

      activePointerIdRef.current = e.pointerId;
      isDraggingRef.current = true;
      latestMoveCoordRef.current = { x, y };

      // Set pointer capture to guarantee pointerup/pointermove are received even if cursor leaves window
      try {
        (e.currentTarget || e.target as HTMLElement).setPointerCapture(e.pointerId);
      } catch {
        // Ignore if pointer capture fails (e.g. mock DOM in tests)
      }

      // Cancel any pending RAF move
      if (rafMoveIdRef.current) {
        cancelAnimationFrame(rafMoveIdRef.current);
        rafMoveIdRef.current = 0;
      }

      // Focus the container if available
      containerRef?.current?.focus();

      scrcpyService
        .sendTouch(transportRef.current, "down", x, y)
        .catch(() => {});
    },
    [normalizePointerEvent, sendNavigationKey, containerRef],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (statusRef.current !== "streaming" || !isDraggingRef.current) return;
      if (
        activePointerIdRef.current !== null &&
        e.pointerId !== activePointerIdRef.current
      ) {
        return;
      }

      const { x, y } = normalizePointerEvent(e);
      latestMoveCoordRef.current = { x, y };

      // Throttle pointer moves via RAF while always dispatching the latest coordinate
      if (!rafMoveIdRef.current) {
        rafMoveIdRef.current = requestAnimationFrame(() => {
          rafMoveIdRef.current = 0;
          if (!isDraggingRef.current) return;
          const pos = latestMoveCoordRef.current;
          if (pos) {
            scrcpyService
              .sendTouch(transportRef.current, "move", pos.x, pos.y)
              .catch(() => {});
          }
        });
      }
    },
    [normalizePointerEvent],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (statusRef.current !== "streaming") return;
      if (
        activePointerIdRef.current !== null &&
        e.pointerId !== activePointerIdRef.current &&
        !isDraggingRef.current
      ) {
        return;
      }

      // Cancel pending move RAF
      if (rafMoveIdRef.current) {
        cancelAnimationFrame(rafMoveIdRef.current);
        rafMoveIdRef.current = 0;
      }

      // Release pointer capture
      try {
        const target = e.currentTarget || (e.target as HTMLElement);
        if (target && target.hasPointerCapture?.(e.pointerId)) {
          target.releasePointerCapture(e.pointerId);
        }
      } catch {}

      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        activePointerIdRef.current = null;
        const { x, y } = normalizePointerEvent(e);
        latestMoveCoordRef.current = null;

        scrcpyService
          .sendTouch(transportRef.current, "up", x, y)
          .catch(() => {});
      }
    },
    [normalizePointerEvent],
  );

  const handlePointerCancel = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isDraggingRef.current) {
        isDraggingRef.current = false;
        activePointerIdRef.current = null;

        if (rafMoveIdRef.current) {
          cancelAnimationFrame(rafMoveIdRef.current);
          rafMoveIdRef.current = 0;
        }

        try {
          const target = e.currentTarget || (e.target as HTMLElement);
          if (target && target.hasPointerCapture?.(e.pointerId)) {
            target.releasePointerCapture(e.pointerId);
          }
        } catch {}

        const pos = latestMoveCoordRef.current || normalizePointerEvent(e);
        latestMoveCoordRef.current = null;

        // Send up on cancel to avoid stuck touch on Android
        scrcpyService
          .sendTouch(transportRef.current, "up", pos.x, pos.y)
          .catch(() => {});
      }
    },
    [normalizePointerEvent],
  );

  const handleLostPointerCapture = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (isDraggingRef.current) {
        handlePointerCancel(e);
      }
    },
    [handlePointerCancel],
  );

  // Wheel & Scroll Throttling
  const processWheelScroll = useCallback(() => {
    const { dx, dy } = computeScrollTicks(wheelAccRef.current);

    if (dx !== 0 || dy !== 0) {
      const pos = latestWheelPosRef.current;
      scrcpyService
        .sendScroll(transportRef.current, pos.x, pos.y, dx, dy)
        .catch(() => {});
    }

    // Set a decay timer to clear leftover sub-threshold delta after 150ms of inactivity
    if (wheelDecayTimerRef.current) {
      clearTimeout(wheelDecayTimerRef.current);
    }
    wheelDecayTimerRef.current = setTimeout(() => {
      wheelDecayTimerRef.current = null;
      wheelAccRef.current = { x: 0, y: 0 };
    }, 150);
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      if (statusRef.current !== "streaming") return;
      e.preventDefault();
      e.stopPropagation();

      const { x, y, inside } = normalizePointerEvent(e);
      if (!inside) return;

      latestWheelPosRef.current = { x, y };
      wheelAccRef.current.x += e.deltaX;
      wheelAccRef.current.y += e.deltaY;

      // Throttle wheel scroll events to 1 dispatch per display frame
      if (!rafWheelIdRef.current) {
        rafWheelIdRef.current = requestAnimationFrame(() => {
          rafWheelIdRef.current = 0;
          processWheelScroll();
        });
      }
    },
    [normalizePointerEvent, processWheelScroll],
  );

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    // Prevent standard webview context menu from appearing over the Android canvas
    e.preventDefault();
  }, []);

  // Keyboard and Text input handling
  const handleKeyDown = useCallback(
    async (e: React.KeyboardEvent<HTMLElement>) => {
      if (statusRef.current !== "streaming") return;
      if (
        composingRef.current ||
        (e.nativeEvent as KeyboardEvent)?.isComposing ||
        e.key === "Dead"
      ) {
        return;
      }

      // Ignore if user is currently typing inside a real HTML input/textarea/editable
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      const { isPaste, isHostShortcut, isNavShortcut } = classifyKeyEvent(e);

      // 1. Clipboard Paste (Cmd+V on macOS or Ctrl+V on Windows/Linux)
      if (isPaste) {
        e.preventDefault();
        e.stopPropagation();
        try {
          const text = await navigator.clipboard.readText();
          if (text) {
            await scrcpyService.sendText(transportRef.current, text);
          }
        } catch {
          // Clipboard read may fail if not permitted
        }
        return;
      }

      // 2. Prevent Host modifier shortcut collisions (e.g. Cmd+W, Cmd+Q, Cmd+R, Cmd+A, Cmd+C)
      // Allow host to handle its own window/application shortcuts
      if (isHostShortcut) {
        return;
      }

      // 3. Navigation shortcuts with Alt / Option modifier (Alt+B, Alt+H, Alt+R, Alt+P, Alt+Arrows)
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (isNavShortcut) {
          const keyLower = e.key.toLowerCase();
          let keycode: number | null = null;

          if (keyLower === "b" || keyLower === "arrowleft") {
            keycode = ANDROID_KEYCODES.BACK;
          } else if (keyLower === "h") {
            keycode = ANDROID_KEYCODES.HOME;
          } else if (keyLower === "s" || keyLower === "r") {
            keycode = ANDROID_KEYCODES.APP_SWITCH;
          } else if (keyLower === "p") {
            keycode = ANDROID_KEYCODES.POWER;
          } else if (e.key === "ArrowUp") {
            keycode = ANDROID_KEYCODES.VOLUME_UP;
          } else if (e.key === "ArrowDown") {
            keycode = ANDROID_KEYCODES.VOLUME_DOWN;
          }

          if (keycode !== null) {
            e.preventDefault();
            e.stopPropagation();
            void sendNavigationKey(keycode);
            return;
          }
        }

        // If Alt was pressed with any other character, return to avoid injecting accented host characters
        return;
      }

      // 4. Special non-printable keys (Enter, Backspace, Delete, Arrows, Tab, Escape, Home, End)
      const specialKeycode = SPECIAL_KEY_MAP[e.key];
      if (specialKeycode !== undefined) {
        e.preventDefault();
        e.stopPropagation();
        void sendNavigationKey(specialKeycode);
        return;
      }

      // 5. Printable single-character text injection
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        scrcpyService
          .sendText(transportRef.current, e.key)
          .catch(() => {});
      }
    },
    [sendNavigationKey],
  );

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true;
  }, []);

  const handleCompositionEnd = useCallback(
    (e: React.CompositionEvent<HTMLElement>) => {
      composingRef.current = false;
      if (statusRef.current === "streaming" && e.data) {
        scrcpyService
          .sendText(transportRef.current, e.data)
          .catch(() => {});
      }
    },
    [],
  );

  // Global window keyboard listener for navigation shortcuts when mirror is streaming
  useEffect(() => {
    if (!enableShortcuts || status !== "streaming") return;

    const handleWindowKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input/textarea/contenteditable
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      let keycode: number | null = null;

      if (e.altKey && !e.metaKey && !e.ctrlKey) {
        const keyLower = e.key.toLowerCase();
        if (keyLower === "b" || keyLower === "arrowleft") {
          keycode = ANDROID_KEYCODES.BACK;
        } else if (keyLower === "h") {
          keycode = ANDROID_KEYCODES.HOME;
        } else if (keyLower === "s" || keyLower === "r") {
          keycode = ANDROID_KEYCODES.APP_SWITCH;
        } else if (keyLower === "p") {
          keycode = ANDROID_KEYCODES.POWER;
        } else if (e.key === "ArrowUp") {
          keycode = ANDROID_KEYCODES.VOLUME_UP;
        } else if (e.key === "ArrowDown") {
          keycode = ANDROID_KEYCODES.VOLUME_DOWN;
        }
      } else if (!e.altKey && !e.ctrlKey && !e.metaKey) {
        if (e.key === "Escape") {
          // Only map Escape to Android BACK when the event originates inside
          // the mirror container, so we don't steal Escape for modals/overlays.
          const isTargetInsideContainer = containerRef?.current &&
            containerRef.current.contains(e.target as Node);
          if (isTargetInsideContainer) {
            keycode = ANDROID_KEYCODES.BACK;
          }
        }
      }

      if (keycode !== null) {
        e.preventDefault();
        e.stopPropagation();
        void sendNavigationKey(keycode);
      }
    };

    window.addEventListener("keydown", handleWindowKeyDown, true);
    return () => {
      window.removeEventListener("keydown", handleWindowKeyDown, true);
    };
  }, [enableShortcuts, status, sendNavigationKey, containerRef]);

  return {
    canvasProps: {
      onPointerDown: handlePointerDown,
      onPointerMove: handlePointerMove,
      onPointerUp: handlePointerUp,
      onPointerCancel: handlePointerCancel,
      onLostPointerCapture: handleLostPointerCapture,
      onWheel: handleWheel,
      onContextMenu: handleContextMenu,
    },
    containerProps: {
      tabIndex: 0,
      onKeyDown: handleKeyDown,
      onCompositionStart: handleCompositionStart,
      onCompositionEnd: handleCompositionEnd,
    },
    sendNavigationKey,
    sendText,
    getVideoRect,
    normalizePointerEvent,
  };
}
