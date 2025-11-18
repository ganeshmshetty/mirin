import { useState, useEffect } from "react";
import { scrcpyService, ProcessStats } from "../services";

export function ProcessManager() {
  const [stats, setStats] = useState<ProcessStats | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadStats();

    // Refresh stats every 5 seconds
    const interval = setInterval(loadStats, 5000);

    return () => clearInterval(interval);
  }, []);

  const loadStats = async () => {
    try {
      const processStats = await scrcpyService.getProcessStats();
      setStats(processStats);
    } catch (err) {
      console.error("Failed to load process stats:", err);
    }
  };

  const handleStopAll = async () => {
    if (!window.confirm("Are you sure you want to stop all mirroring sessions?")) {
      return;
    }

    try {
      setLoading(true);
      const stoppedCount = await scrcpyService.stopAllMirroring();
      console.log(`Stopped ${stoppedCount} session(s)`);
      await loadStats(); // Refresh stats
    } catch (err) {
      console.error("Failed to stop all sessions:", err);
      alert("Failed to stop all sessions: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setLoading(false);
    }
  };

  if (!stats || stats.active_sessions === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Process Manager</h3>
          <p className="text-sm text-gray-600">
            {stats.active_sessions} active session{stats.active_sessions !== 1 ? "s" : ""}
          </p>
        </div>

        {stats.active_sessions > 0 && (
          <button
            onClick={handleStopAll}
            disabled={loading}
            className="px-4 py-2 bg-red-600 text-white text-sm font-medium rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Stopping..." : "Stop All Sessions"}
          </button>
        )}
      </div>
    </div>
  );
}
