import { useState, useEffect, useRef } from "react";
import { consoleService } from "../services";
import { Terminal, Trash2, Play, Square, CornerDownLeft } from "lucide-react";
import { useToast } from "./ToastProvider";

interface ConsoleManagerProps {
  deviceId: string;
}

export function ConsoleManager({ deviceId }: ConsoleManagerProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [isLogcatRunning, setIsLogcatRunning] = useState(false);
  const [command, setCommand] = useState("");
  const [isExecuting, setIsExecuting] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    const setupListener = async () => {
      unlisten = await consoleService.listenToLogcat((payload) => {
        if (payload.device_id === deviceId) {
          setLogs((prev) => {
            const newLogs = [...prev, payload.line];
            if (newLogs.length > 2000) {
              return newLogs.slice(-2000);
            }
            return newLogs;
          });
        }
      });
    };

    setupListener();

    return () => {
      if (unlisten) unlisten();
      // We explicitly leave logcat running in backend so you don't lose it if you swap tabs,
      // but maybe it's better to stop. For now, leave running.
    };
  }, [deviceId]);

  useEffect(() => {
    // Auto-scroll
    if (logsEndRef.current) {
        logsEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  const toggleLogcat = async () => {
    try {
      if (isLogcatRunning) {
        await consoleService.stopLogcat(deviceId);
        setIsLogcatRunning(false);
      } else {
        await consoleService.startLogcat(deviceId);
        setIsLogcatRunning(true);
      }
    } catch (err: any) {
      toast.error(`Failed to toggle logcat: ${err}`);
    }
  };

  const executeCommand = async () => {
    if (!command.trim()) return;
    
    setIsExecuting(true);
    setLogs((prev) => [...prev.slice(-1999), `$ ${command}`]);
    
    try {
      const output = await consoleService.executeShellCommand(deviceId, command);
      if (output.trim()) {
        const outputLines = output.trim().split('\n');
        setLogs((prev) => {
            const newLogs = [...prev, ...outputLines];
            return newLogs.length > 2000 ? newLogs.slice(-2000) : newLogs;
        });
      }
      setCommand("");
    } catch (err: any) {
      setLogs((prev) => [...prev.slice(-1999), `Error: ${err}`]);
    } finally {
      setIsExecuting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand();
    }
  };

  const clearLogs = () => {
    setLogs([]);
  };

  return (
    <div className="flex flex-col h-full bg-gray-50/50 dark:bg-[#0e1012] overflow-hidden p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2 ml-12">
          <Terminal className="text-cyan-600 dark:text-cyan-400" />
          ADB Console
        </h3>
        <div className="flex gap-2">
          <button
            onClick={toggleLogcat}
            className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-sm font-medium transition-colors shadow-sm ${
              isLogcatRunning 
                ? "bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-100 dark:bg-orange-900/20 dark:text-orange-400 dark:border-orange-900/30 dark:hover:bg-orange-900/40" 
                : "bg-white text-gray-700 border-gray-200 hover:bg-gray-50 dark:bg-[#16191b] dark:text-slate-300 dark:border-[#222629] dark:hover:bg-[#1d2327]"
            }`}
          >
            {isLogcatRunning ? <Square size={16} /> : <Play size={16} />}
            <span className="hidden sm:inline">{isLogcatRunning ? "Stop Logcat" : "Start Logcat"}</span>
          </button>
          <button
            onClick={clearLogs}
            className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-[#16191b] hover:bg-gray-50 dark:hover:bg-[#1d2327] border border-gray-200 dark:border-[#222629] rounded-xl text-sm font-medium text-gray-700 dark:text-slate-300 transition-colors shadow-sm"
          >
            <Trash2 size={16} />
            <span className="hidden sm:inline">Clear</span>
          </button>
        </div>
      </div>

      <div className="flex flex-col flex-1 bg-[#1e1e1e] rounded-xl border border-gray-800 dark:border-black/50 overflow-hidden shadow-lg shadow-black/10">
        <div className="h-10 bg-[#2d2d2d] flex items-center px-4 border-b border-black/20">
          <span className="text-xs text-gray-400 font-mono">adb shell / logcat output</span>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4 font-mono text-sm relative">
          {logs.length === 0 ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 italic gap-2">
                <Terminal size={32} className="opacity-30" />
                No output yet. Run a command or start logcat.
            </div>
          ) : (
            <div className="flex flex-col min-h-full">
              {logs.map((log, i) => (
                <div key={i} className={`whitespace-pre-wrap break-all ${log.startsWith('$') ? 'text-green-400 mt-2 mb-1 font-semibold' : log.startsWith('Error:') ? 'text-red-400' : 'text-gray-300'}`}>
                  {log}
                </div>
              ))}
              <div ref={logsEndRef} />
            </div>
          )}
        </div>
        
        <div className="bg-[#252526] border-t border-black/20 p-3">
          <div className="flex items-center bg-[#1e1e1e] border border-[#3c3c3c] rounded-lg focus-within:border-cyan-500/50 transition-colors overflow-hidden px-4">
            <span className="text-green-500 font-mono py-3 font-bold mr-3">$</span>
            <input
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isExecuting}
              className="bg-transparent border-none outline-none text-gray-300 font-mono w-full py-3 placeholder-gray-600 disabled:opacity-50"
              placeholder="adb shell command (e.g. ls -al /sdcard)"
            />
            <button
              onClick={executeCommand}
              disabled={isExecuting || !command.trim()}
              className="p-2 text-cyan-500 hover:text-cyan-400 disabled:opacity-50 disabled:hover:text-cyan-600 transition-colors"
            >
              <CornerDownLeft size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
