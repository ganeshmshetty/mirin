import { useState, useEffect } from "react";
import { appService } from "../services";
import type { AppInfo } from "../types";
import { Search, Play, Square, Trash2, Download, Package, RefreshCw, AlertCircle, LayoutGrid, List } from "lucide-react";
import { useToast } from "./ToastProvider";
import { useConfirmDialog } from "./ConfirmDialog";

interface AppManagerProps {
  deviceId: string;
}

export function AppManager({ deviceId }: AppManagerProps) {
  const [apps, setApps] = useState<AppInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isInstalling, setIsInstalling] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const toast = useToast();
  const { confirm } = useConfirmDialog();

  const loadApps = async () => {
    setIsLoading(true);
    try {
      const list = await appService.listApps(deviceId);
      setApps(list);
    } catch (err: any) {
      toast.error(`Failed to load apps: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, [deviceId]);

  const filteredApps = apps.filter(app => app.package_name.toLowerCase().includes(search.toLowerCase()));

  const handleInstall = async () => {
    try {
      setIsInstalling(true);
      const success = await appService.installApp(deviceId);
      if (success) {
        toast.success("Successfully installed APK.");
        loadApps();
      }
    } catch (err: any) {
      const errorMsg = String(err);
      if (errorMsg.includes("INSTALL_FAILED") || errorMsg.includes("install via usb") || errorMsg.includes("verify")) {
        confirm({
          title: "Install Failed",
          message: "Could not install APK. Please ensure 'Install via USB' is enabled in Developer Options on your device. Also, try disabling 'Verify apps over USB'.",
          confirmText: "OK",
          variant: "warning",
          hideCancel: true
        });
      } else {
        toast.error(`Install failed: ${err}`);
      }
    } finally {
      setIsInstalling(false);
    }
  };

  const handleAction = async (action: 'launch' | 'stop' | 'clear' | 'uninstall', pkg: string) => {
    try {
      if (action === 'launch') {
        await appService.launchApp(deviceId, pkg);
        toast.success(`App Launched: ${pkg}`);
      } else if (action === 'uninstall') {
        const confirmed = await confirm({
          title: "Uninstall App",
          message: `Are you sure you want to uninstall ${pkg}?`,
          confirmText: "Uninstall",
          variant: "danger"
        });
        if (!confirmed) return;
        await appService.uninstallApp(deviceId, pkg);
        toast.success(`App Uninstalled: ${pkg}`);
        loadApps();
      }
    } catch (err: any) {
      toast.error(`Action Failed: ${err}`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-[#0e1012] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-[#222629]">
        <h2 className="text-lg font-bold text-gray-900 dark:text-slate-100 flex items-center gap-2 ml-12">
          <Package className="text-cyan-600 dark:text-cyan-400" />
          App Manager
        </h2>
        <div className="flex items-center gap-3">
          <button
            onClick={loadApps}
            className="p-2 text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#1d2327] rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleInstall}
            disabled={isInstalling}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50"
          >
            <Download size={16} />
            {isInstalling ? "Installing..." : "Install APK"}
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-6 py-4 bg-gray-50 dark:bg-[#16191b] border-b border-gray-200 dark:border-[#222629] flex items-center justify-between">
        <div className="relative w-full max-w-md">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search packages..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-white dark:bg-[#0e1012] border border-gray-200 dark:border-[#2a3036] rounded-lg text-sm text-gray-900 dark:text-slate-100 placeholder-gray-500 focus:outline-none focus:border-cyan-500 dark:focus:border-cyan-500 transition-colors"
          />
        </div>
        <div className="flex items-center gap-4">
          <div className="flex bg-gray-200 dark:bg-[#1d2327] rounded-lg p-1">
            <button
              onClick={() => setViewMode("grid")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "grid" ? "bg-white dark:bg-[#252b30] text-cyan-600 dark:text-cyan-400 shadow-sm" : "text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200"}`}
              title="Grid View"
            >
              <LayoutGrid size={16} />
            </button>
            <button
              onClick={() => setViewMode("list")}
              className={`p-1.5 rounded-md transition-colors ${viewMode === "list" ? "bg-white dark:bg-[#252b30] text-cyan-600 dark:text-cyan-400 shadow-sm" : "text-gray-500 hover:text-gray-900 dark:text-slate-400 dark:hover:text-slate-200"}`}
              title="List View"
            >
              <List size={16} />
            </button>
          </div>
          <div className="text-sm text-gray-500 dark:text-slate-400 font-medium whitespace-nowrap">
            {filteredApps.length} Apps
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-6">
        {isLoading && apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
            <RefreshCw className="animate-spin text-cyan-500" />
            <p>Loading apps...</p>
          </div>
        ) : filteredApps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3 text-gray-500">
            <AlertCircle size={32} className="opacity-50" />
            <p>No apps found.</p>
          </div>
        ) : (
          <div className={viewMode === "grid" ? "grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-4" : "flex flex-col gap-2 max-w-4xl mx-auto"}>
            {filteredApps.map((app) => (
              viewMode === "grid" ? (
                <div key={app.package_name} className="flex flex-col items-center justify-center p-4 bg-white dark:bg-[#16191b] border border-gray-200 dark:border-[#222629] rounded-xl hover:border-cyan-500/50 transition-all shadow-sm shadow-black/5 dark:shadow-none group relative overflow-hidden text-center h-32">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-[#1d2327] rounded-2xl flex items-center justify-center text-gray-500 mb-2 transition-transform group-hover:-translate-y-1 group-hover:scale-105">
                    <Package size={24} />
                  </div>
                  <h4 className="font-medium text-gray-900 dark:text-slate-200 text-xs truncate w-full px-1" title={app.package_name}>
                    {app.package_name.split('.').pop()}
                  </h4>
                  
                  {/* Grid Action Overlay */}
                  <div className="absolute inset-0 bg-white/90 dark:bg-[#16191b]/95 flex flex-col items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity backdrop-blur-sm">
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleAction('launch', app.package_name)} className="p-2 text-cyan-600 bg-cyan-50 dark:text-cyan-400 dark:bg-cyan-900/30 rounded-lg hover:scale-110 transition-transform" title="Launch App">
                        <Play size={16} />
                      </button>
                      <button onClick={() => handleAction('uninstall', app.package_name)} className="p-2 text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/30 rounded-lg hover:scale-110 transition-transform" title="Uninstall">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div key={app.package_name} className="flex items-center justify-between p-4 bg-white dark:bg-[#16191b] border border-gray-200 dark:border-[#222629] rounded-xl hover:border-cyan-500/50 transition-colors shadow-sm shadow-black/5 dark:shadow-none group">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 bg-gray-100 dark:bg-[#1d2327] rounded-lg flex items-center justify-center text-gray-500 shrink-0">
                      <Package size={20} />
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-semibold text-gray-900 dark:text-slate-100 truncate text-sm">
                        {app.package_name}
                      </h4>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => handleAction('launch', app.package_name)} className="p-2 text-gray-500 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-900/20 rounded-lg transition-colors" title="Launch App">
                      <Play size={16} />
                    </button>
                    <button onClick={() => handleAction('stop', app.package_name)} className="p-2 text-gray-500 hover:text-orange-600 dark:hover:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors" title="Force Stop">
                      <Square size={16} />
                    </button>
                    <div className="w-px h-4 bg-gray-200 dark:bg-[#2a3036] mx-1"></div>
                    <button onClick={() => handleAction('uninstall', app.package_name)} className="p-2 text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors" title="Uninstall">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
