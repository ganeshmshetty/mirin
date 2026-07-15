import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Play, Package, FolderOpen, Terminal, Settings } from "lucide-react";
import { deviceService, scrcpyService } from "../services";
import { useToast } from "../components/ToastProvider";
import type { Device } from "../types";

export function DeviceDashboard() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  
  const [device, setDevice] = useState<Device | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    // Fetch device details
    const loadDevice = async () => {
      try {
        const connectedDevices = await deviceService.getConnectedDevices();
        const found = connectedDevices.find(d => d.id === id);
        
        if (found) {
          setDevice(found);
        } else {
          // Check saved devices if not connected
          const savedDevices = await deviceService.getSavedDevices();
          const savedFound = savedDevices.find(d => d.id === id);
          if (savedFound) {
            setDevice({ ...savedFound, status: "Offline" });
          } else {
            toast.error("Device not found");
            navigate("/");
          }
        }
      } catch (err) {
        console.error(err);
        toast.error("Failed to load device details");
        navigate("/");
      }
    };
    
    if (id) loadDevice();
  }, [id, navigate, toast]);

  const handleStartMirroring = async () => {
    if (!device) return;
    try {
      const connections = Array.isArray(device.connections) ? device.connections : [];
      const targetConnectionId = connections.find(c => c.status === "Connected")?.id || connections[0]?.id || device.id;
      await scrcpyService.startMirroring(targetConnectionId, {});
      toast.success(`Started mirroring ${device.name}`);
    } catch (err) {
      toast.error(`Failed to start mirroring: ${err}`);
    }
  };

  if (!device) return <div className="p-8 text-app-muted">Loading device...</div>;

  const isConnected = device.status !== "Offline" && device.status !== "Disconnected";

  return (
    <div className="flex-1 flex flex-col h-full bg-gray-50 dark:bg-[#0e1012] overflow-hidden">
      {/* Dashboard Header */}
      <header className="h-16 bg-white dark:bg-[#16191b] border-b border-app-border flex items-center justify-between px-6 flex-shrink-0">
        
        {/* Left: Back Button & Context */}
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate("/")}
            className="p-1.5 rounded-md text-app-muted hover:text-app-text hover:bg-app-hover transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-app-text">{device.name}</span>
              <span className={`w-2 h-2 rounded-full ${isConnected ? "bg-green-500" : "bg-gray-400"}`} />
            </div>
            <span className="text-xs text-app-muted">{device.id} • {device.model}</span>
          </div>
        </div>

        {/* Right: Primary Action */}
        <div>
          <button
            onClick={handleStartMirroring}
            disabled={!isConnected}
            className="flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Play size={16} fill="currentColor" />
            Start Mirroring
          </button>
        </div>
      </header>

      {/* Tabs Navigation */}
      <div className="bg-white dark:bg-[#16191b] border-b border-app-border px-6 flex gap-6">
        {[
          { id: "overview", label: "Overview", icon: Settings },
          { id: "apps", label: "Apps", icon: Package },
          { id: "files", label: "Files", icon: FolderOpen },
          { id: "console", label: "Console", icon: Terminal },
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                isActive 
                  ? "border-cyan-500 text-cyan-600 dark:text-cyan-400" 
                  : "border-transparent text-app-muted hover:text-app-text hover:border-gray-300 dark:hover:border-gray-700"
              }`}
            >
              <Icon size={16} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Area */}
      <main className="flex-1 overflow-auto p-6">
        {activeTab === "overview" && (
          <div className="space-y-6 animate-fade-in">
            <h3 className="text-lg font-medium text-app-text">Device Overview</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-app-card border border-app-border rounded-xl p-5 shadow-sm">
                <p className="text-sm text-app-muted mb-1">Status</p>
                <p className="text-lg font-semibold text-app-text">{device.status}</p>
              </div>
              <div className="bg-app-card border border-app-border rounded-xl p-5 shadow-sm">
                <p className="text-sm text-app-muted mb-1">Connection Type</p>
                <p className="text-lg font-semibold text-app-text">{device.connection_type}</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === "apps" && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <div className="w-64 h-32 border-2 border-dashed border-cyan-500/30 rounded-xl flex items-center justify-center bg-cyan-500/5 mb-6">
              <span className="text-cyan-600 dark:text-cyan-400 font-medium flex items-center gap-2">
                <Package size={20} /> Drop APK here to install
              </span>
            </div>
            <h3 className="text-xl font-medium text-app-text mb-2">App Manager</h3>
            <p className="text-app-muted max-w-md">The App Manager will allow you to view installed packages, uninstall apps, and side-load APKs seamlessly.</p>
          </div>
        )}

        {activeTab === "files" && (
          <div className="flex flex-col items-center justify-center h-full text-center animate-fade-in">
            <FolderOpen size={48} className="text-gray-300 dark:text-gray-700 mb-4" />
            <h3 className="text-xl font-medium text-app-text mb-2">File Explorer</h3>
            <p className="text-app-muted max-w-md">Browse internal storage, push files to the device by dragging them here, and pull files to your computer.</p>
          </div>
        )}

        {activeTab === "console" && (
          <div className="flex flex-col h-full bg-[#1e1e1e] rounded-xl border border-app-border overflow-hidden animate-fade-in">
            <div className="h-10 bg-[#2d2d2d] flex items-center px-4 border-b border-black/20">
              <span className="text-xs text-gray-400 font-mono">adb logcat</span>
            </div>
            <div className="flex-1 p-4">
              <p className="text-gray-500 font-mono text-sm">Waiting for logs... (Feature coming soon)</p>
            </div>
            <div className="h-12 bg-[#252526] border-t border-black/20 flex items-center px-4">
              <span className="text-green-500 font-mono mr-2">$</span>
              <input type="text" className="bg-transparent border-none outline-none text-gray-300 font-mono w-full" placeholder="adb shell command..." disabled />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
