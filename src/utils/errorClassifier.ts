/**
 * Error Classifier for Scrcpy Mirroring and ADB Connections
 * Categorizes errors into Fatal/Permanent vs Transient with actionable resolution advice.
 */

export type ErrorCategory =
  | "unauthorized"
  | "not_found"
  | "codec_unsupported"
  | "server_binary"
  | "permission_denied"
  | "transient";

export interface ErrorClassification {
  /** Whether the error is permanent/fatal (auto-retry should halt immediately) */
  isFatal: boolean;
  /** Categorized error type */
  category: ErrorCategory;
  /** User-friendly heading */
  title: string;
  /** Detailed error message */
  message: string;
  /** Actionable instructions for the user to resolve the issue */
  resolution: string;
}

export function classifyMirrorError(
  rawError: unknown,
  fallbackMessage = "An unexpected mirror error occurred",
): ErrorClassification {
  let message = "";
  if (typeof rawError === "string") {
    message = rawError.trim();
  } else if (rawError instanceof Error) {
    message = rawError.message.trim();
  } else if (
    rawError &&
    typeof rawError === "object" &&
    "message" in rawError &&
    typeof (rawError as any).message === "string"
  ) {
    message = (rawError as any).message.trim();
  } else if (rawError) {
    message = String(rawError).trim();
  } else {
    message = fallbackMessage;
  }

  const lower = message.toLowerCase();

  // 1. Device Unauthorized
  if (
    lower.includes("unauthorized") ||
    lower.includes("device not authorized") ||
    lower.includes("allow usb debugging") ||
    lower.includes("unauthenticated")
  ) {
    return {
      isFatal: true,
      category: "unauthorized",
      title: "Device Unauthorized",
      message: message || "USB debugging authorization is required.",
      resolution:
        "Unlock your Android device screen and tap 'Always allow from this computer' on the USB debugging prompt.",
    };
  }

  // 2. Device Not Found / Offline (requires an explicit device-unavailable/not-found phrase)
  if (
    lower.includes("device not found") ||
    lower.includes("no devices/emulators found") ||
    lower.includes("target device not found") ||
    lower.includes("device unavailable") ||
    (lower.includes("device offline") && !lower.includes("restarting")) ||
    lower.includes("device not responding")
  ) {
    return {
      isFatal: true,
      category: "not_found",
      title: "Device Not Found",
      message: message || "Device is offline or not found.",
      resolution:
        "Ensure your device is connected via USB with USB debugging enabled, or verify Wi-Fi ADB connection.",
    };
  }

  // 3. Codec or WebCodecs Unsupported
  if (
    (lower.includes("codec") &&
      (lower.includes("unsupported") ||
        lower.includes("not supported") ||
        lower.includes("invalid") ||
        lower.includes("failed to configure"))) ||
    lower.includes("videodecoder is not supported") ||
    lower.includes("webcodecs")
  ) {
    return {
      isFatal: true,
      category: "codec_unsupported",
      title: "Video Codec Unsupported",
      message: message || "Video decoder or codec is not supported on this platform.",
      resolution:
        "Hardware video decoding for this codec failed. Switch between H.264/H.265 in settings or update graphics drivers.",
    };
  }

  // 4. Scrcpy Server Binary Missing / Corrupted
  if (
    lower.includes("scrcpy-server.jar not found") ||
    lower.includes("invalid server path") ||
    lower.includes("failed to push scrcpy-server") ||
    lower.includes("scrcpy-server not found")
  ) {
    return {
      isFatal: true,
      category: "server_binary",
      title: "Scrcpy Server Error",
      message: message || "scrcpy-server binary is missing or invalid.",
      resolution:
        "The scrcpy-server binary was not found or could not be pushed to the device. Please reinstall or verify application files.",
    };
  }

  // 5. Permission Denied
  if (lower.includes("permission denied") || lower.includes("access denied")) {
    return {
      isFatal: true,
      category: "permission_denied",
      title: "Permission Denied",
      message: message || "ADB or system permission was denied.",
      resolution:
        "Verify Android developer permissions, or restart ADB with appropriate user privileges.",
    };
  }

  // 6. Transient Network Disconnects / Timeouts / Socket Resets
  let resolution = "Attempting automatic reconnection with progressive backoff...";
  if (lower.includes("timed out") || lower.includes("timeout")) {
    resolution = "Connection timed out. Retrying connection...";
  } else if (
    lower.includes("connection reset") ||
    lower.includes("broken pipe") ||
    lower.includes("connection refused")
  ) {
    resolution = "Network socket was reset. Retrying stream...";
  } else if (
    lower.includes("disconnected") ||
    lower.includes("device disconnected")
  ) {
    resolution = "Stream disconnected unexpectedly. Re-establishing scrcpy session...";
  }

  return {
    isFatal: false,
    category: "transient",
    title: "Stream Disconnected",
    message: message || "Stream connection lost.",
    resolution,
  };
}
