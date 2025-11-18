import { useEffect, useState } from "react";
import { scrcpyService } from "../services";
import type { SessionStatus } from "../types";

interface MirrorStatusProps {
  sessionId?: string;
  deviceName: string;
  onCrashDetected?: () => void;
}

export function MirrorStatus({ sessionId, deviceName, onCrashDetected }: MirrorStatusProps) {
  const [status, setStatus] = useState<SessionStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [crashed, setCrashed] = useState(false);

  useEffect(() => {
    if (!sessionId) {
      setStatus(null);
      setCrashed(false);
      return;
    }

    // Initial status check
    checkStatus();

    // Poll status every 3 seconds
    const interval = setInterval(checkStatus, 3000);

    return () => clearInterval(interval);
  }, [sessionId]);

  const checkStatus = async () => {
    if (!sessionId) return;

    try {
      setLoading(true);
      const currentStatus = await scrcpyService.getMirroringStatus(sessionId);
      
      // Detect crash: if we expected it to be running but it's stopped
      if (status === "Running" && currentStatus === "Stopped" && !crashed) {
        setCrashed(true);
        console.warn(`Session ${sessionId} crashed or was terminated unexpectedly`);
        onCrashDetected?.();
      }
      
      setStatus(currentStatus);
    } catch (err) {
      console.error("Failed to get mirroring status:", err);
      setStatus("Stopped" as SessionStatus);
    } finally {
      setLoading(false);
    }
  };

  if (!sessionId || !status) {
    return null;
  }

  const statusConfig = {
    Running: {
      color: "bg-green-100 text-green-800 border-green-300",
      icon: "●",
      label: "Mirroring Active",
    },
    Stopped: {
      color: crashed ? "bg-orange-100 text-orange-800 border-orange-300" : "bg-gray-100 text-gray-800 border-gray-300",
      icon: crashed ? "⚠" : "○",
      label: crashed ? "Session Ended" : "Stopped",
    },
    Error: {
      color: "bg-red-100 text-red-800 border-red-300",
      icon: "✕",
      label: "Error",
    },
  };

  const config = statusConfig[status];

  return (
    <div className={`px-3 py-2 rounded-md border ${config.color} flex items-center gap-2`}>
      <span className="text-lg">{config.icon}</span>
      <div className="flex-1">
        <p className="font-medium text-sm">{config.label}</p>
        <p className="text-xs opacity-75">{deviceName}</p>
        {crashed && (
          <p className="text-xs mt-1 font-medium">Process terminated</p>
        )}
      </div>
      {loading && (
        <div className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full"></div>
      )}
    </div>
  );
}
