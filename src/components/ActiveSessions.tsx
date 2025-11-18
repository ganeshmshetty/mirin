import { useState, useEffect } from "react";
import { scrcpyService } from "../services";
import type { MirrorSession } from "../types";

export function ActiveSessions() {
  const [sessions, setSessions] = useState<MirrorSession[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadSessions();

    // Refresh sessions every 5 seconds
    const interval = setInterval(loadSessions, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadSessions = async () => {
    try {
      setLoading(true);
      const activeSessions = await scrcpyService.getActiveSessions();
      setSessions(activeSessions);
    } catch (err) {
      console.error("Failed to load active sessions:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleStopSession = async (sessionId: string) => {
    try {
      await scrcpyService.stopMirroring(sessionId);
      await loadSessions(); // Refresh list
    } catch (err) {
      console.error("Failed to stop session:", err);
    }
  };

  if (sessions.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-900">Active Mirroring Sessions</h2>
        {loading && (
          <div className="animate-spin h-5 w-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
        )}
      </div>

      <div className="space-y-2">
        {sessions.map((session) => (
          <div
            key={session.session_id}
            className="flex items-center justify-between p-3 bg-gray-50 rounded-md border border-gray-200"
          >
            <div className="flex items-center gap-3">
              <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></div>
              <div>
                <p className="font-medium text-sm text-gray-900">
                  Device: {session.device_id}
                </p>
                <p className="text-xs text-gray-600">
                  Started: {new Date(session.started_at).toLocaleTimeString()}
                </p>
              </div>
            </div>

            <button
              onClick={() => handleStopSession(session.session_id)}
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            >
              Stop
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
