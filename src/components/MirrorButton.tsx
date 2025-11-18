import { useState } from "react";
import type { Device, ScrcpyOptions } from "../types";
import { scrcpyService } from "../services";

interface MirrorButtonProps {
  device: Device;
  sessionId?: string;
  isActive: boolean;
  onSessionStart?: (sessionId: string) => void;
  onSessionEnd?: () => void;
}

export function MirrorButton({ 
  device, 
  sessionId, 
  isActive, 
  onSessionStart, 
  onSessionEnd 
}: MirrorButtonProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleStartMirroring = async () => {
    try {
      setLoading(true);
      setError(null);

      // Default options
      const options: Partial<ScrcpyOptions> = {
        max_size: 1920,
        bit_rate: 8000000,
        max_fps: 60,
        always_on_top: false,
        stay_awake: true,
        turn_screen_off: false,
      };

      const newSessionId = await scrcpyService.startMirroring(device.id, options);
      onSessionStart?.(newSessionId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to start mirroring:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStopMirroring = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      setError(null);
      await scrcpyService.stopMirroring(sessionId);
      onSessionEnd?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      console.error("Failed to stop mirroring:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {!isActive ? (
        <button
          onClick={handleStartMirroring}
          disabled={loading || device.status !== "Connected"}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? "Starting..." : "Start Mirroring"}
        </button>
      ) : (
        <button
          onClick={handleStopMirroring}
          disabled={loading}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? "Stopping..." : "Stop Mirroring"}
        </button>
      )}

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-2 py-1">
          {error}
        </p>
      )}
    </div>
  );
}
