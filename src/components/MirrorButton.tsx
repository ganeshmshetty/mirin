import type { Device } from "../types";

interface MirrorButtonProps {
  device: Device;
  isActive: boolean;
  isLoading: boolean;
  onStart: () => void;
  onStop: () => void;
  error?: string | null;
}

export function MirrorButton({
  device,
  isActive,
  isLoading,
  onStart,
  onStop,
  error,
}: MirrorButtonProps) {
  return (
    <div className="flex flex-col gap-2">
      {!isActive ? (
        <button
          onClick={onStart}
          disabled={isLoading || device.status !== "Connected"}
          className="btn-primary"
        >
          {isLoading ? "Starting..." : "Start Mirroring"}
        </button>
      ) : (
        <button
          onClick={onStop}
          disabled={isLoading}
          className="btn-danger"
        >
          {isLoading ? "Stopping..." : "Stop Mirroring"}
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
