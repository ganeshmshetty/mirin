import { useState, useEffect, useRef, useCallback } from "react";
import { consoleService } from "../services";
import {
  Terminal,
  Trash2,
  Play,
  Square,
  CornerDownLeft,
  ArrowDownToLine,
} from "lucide-react";
import { useToast } from "./ToastProvider";
import { useTranslation } from "react-i18next";

interface ConsoleManagerProps {
  deviceId: string;
}

const MAX_LOG_LINES = 2000;

export function ConsoleManager({ deviceId }: ConsoleManagerProps) {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string[]>([]);
  const [isLogcatRunning, setIsLogcatRunning] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [command, setCommand] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(false);
  const toast = useToast();

  // Keep ref in sync so the log listener can skip appends without re-subscribing.
  useEffect(() => {
    isPausedRef.current = isPaused;
  }, [isPaused]);

  const appendLines = useCallback((lines: string[]) => {
    if (lines.length === 0) return;
    setLogs((prev) => {
      const next =
        prev.length + lines.length > MAX_LOG_LINES
          ? [...prev, ...lines].slice(-MAX_LOG_LINES)
          : [...prev, ...lines];
      return next;
    });
  }, []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;

    const setupListener = async () => {
      unlisten = await consoleService.listenToLogcat((payload) => {
        if (payload.device_id !== deviceId) return;
        // Pause stops display buffering so memory stays bounded while paused.
        if (isPausedRef.current) return;
        appendLines([payload.line]);
      });
    };

    setupListener();

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
      // Stop backend logcat when leaving the Console tab so streams don't leak across tools.
      consoleService.stopLogcat(deviceId).catch(() => {});
      void cancelled;
    };
  }, [deviceId, appendLines]);

  useEffect(() => {
    if (!autoScroll || !logsEndRef.current) return;
    logsEndRef.current.scrollIntoView({ behavior: "smooth" });
  }, [logs, autoScroll]);

  const toggleLogcat = async () => {
    try {
      if (isLogcatRunning) {
        await consoleService.stopLogcat(deviceId);
        setIsLogcatRunning(false);
      } else {
        await consoleService.startLogcat(deviceId);
        setIsLogcatRunning(true);
        setIsPaused(false);
      }
    } catch (err: any) {
      toast.error(`${t("console.failed_toggle")}: ${err}`);
    }
  };

  const executeCommand = async () => {
    if (!command.trim()) return;

    setIsExecuting(true);
    appendLines([`$ ${command}`]);

    try {
      const output = await consoleService.executeShellCommand(
        deviceId,
        command,
      );
      if (output.trim()) {
        appendLines(output.trim().split("\n"));
      }
      setCommand("");
    } catch (err: any) {
      appendLines([`Error: ${err}`]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      executeCommand();
    }
  };

  const clearLogs = () => {
    // Replace with a new empty array so React drops the previous large buffer.
    setLogs([]);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-[#0e1012] overflow-hidden p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2 ml-12">
          <Terminal className="text-cyan-600 dark:text-cyan-400" />
          {t("console.title")}
        </h3>
        <div className="flex gap-2 flex-wrap justify-end">
          <button
            onClick={toggleLogcat}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors shadow-sm ${
              isLogcatRunning
                ? "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30 dark:hover:bg-orange-900/40"
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-[#16191b] dark:text-slate-300 dark:border-[#222629] dark:hover:bg-[#1d2327]"
            }`}
          >
            {isLogcatRunning ? <Square size={16} /> : <Play size={16} />}
            <span className="hidden sm:inline">
              {isLogcatRunning ? t("console.stop_logcat") : t("console.start_logcat")}
            </span>
          </button>
          {isLogcatRunning && (
            <button
              onClick={() => setIsPaused((p) => !p)}
              className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors shadow-sm ${
                isPaused
                  ? "bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-900/30"
                  : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-[#16191b] dark:text-slate-300 dark:border-[#222629] dark:hover:bg-[#1d2327]"
              }`}
              title={
                isPaused
                  ? t("console.resume_tooltip")
                  : t("console.pause_tooltip")
              }
            >
              {isPaused ? t("console.resume") : t("console.pause")}
            </button>
          )}
          <button
            onClick={() => setAutoScroll((v) => !v)}
            className={`flex items-center gap-2 px-3 py-2 border rounded-xl text-sm font-medium transition-colors shadow-sm ${
              autoScroll
                ? "bg-white text-cyan-700 border-cyan-200 dark:bg-[#16191b] dark:text-cyan-400 dark:border-cyan-900/40"
                : "bg-white text-gray-500 border-gray-200 dark:bg-[#16191b] dark:text-slate-500 dark:border-[#222629]"
            }`}
            title={t("console.auto_scroll_tooltip")}
          >
            <ArrowDownToLine size={16} />
            <span className="hidden sm:inline">{t("console.auto_scroll")}</span>
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#16191b] hover:bg-gray-50 dark:hover:bg-[#1d2327] border border-gray-200 dark:border-[#222629] rounded-xl text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors shadow-sm"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">{t("console.clear")}</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 bg-[#1e1e1e] rounded-xl border border-gray-800 dark:border-black/50 overflow-hidden shadow-lg shadow-black/10 min-h-0">
        <div className="h-10 bg-[#2d2d2d] flex items-center justify-between px-4 border-b border-black/20">
          <span className="text-xs text-gray-400 font-mono">
            {t("console.output_header")}
          </span>
          <span className="text-[10px] text-gray-500 font-mono">
            {logs.length}/{MAX_LOG_LINES}
            {isPaused ? t("console.paused") : ""}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto p-4 font-mono text-sm relative min-h-0">
          {logs.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 italic gap-2">
              <Terminal size={32} className="opacity-30" />
              {t("console.no_output")}
            </div>
          ) : (
            <div className="flex flex-col min-h-full">
              {logs.map((log, i) => (
                <div
                  key={i}
                  className={`whitespace-pre-wrap break-all ${
                    log.startsWith("$")
                      ? "text-green-400 mt-2 mb-1 font-semibold"
                      : log.startsWith("Error:")
                        ? "text-red-400"
                        : "text-gray-300"
                  }`}
                >
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>

        <div className="bg-[#252526] border-t border-black/20 p-3">
          <div className="flex items-center gap-2">
            <span className="text-green-400 font-mono text-sm select-none">
              $
            </span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isExecuting}
              placeholder={t("console.placeholder")}
              className="flex-1 bg-transparent text-gray-200 font-mono text-sm outline-none placeholder-gray-600"
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={executeCommand}
              disabled={isExecuting || !command.trim()}
              className="p-2 text-gray-400 hover:text-cyan-400 disabled:opacity-40 transition-colors"
              title={t("console.run_tooltip")}
            >
              <CornerDownLeft size={16} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
