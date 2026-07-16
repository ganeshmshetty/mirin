import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { deviceService } from "../services";
import { useToast } from "../components/ToastProvider";
import { EmbeddedMirrorView } from "../components/EmbeddedMirrorView";
import { AppManager } from "../components/AppManager";
import { FileManager } from "../components/FileManager";
import { ConsoleManager } from "../components/ConsoleManager";
import type { Device } from "../types";

export type DeviceTool = "screen" | "overview" | "apps" | "files" | "console";

interface DeviceDashboardProps {
  /** Controlled tool from app shell rail; falls back to ?tab= */
  activeTool?: string;
  onDeviceMeta?: (meta: {
    id: string;
    name: string;
    model?: string;
    isConnected: boolean;
  } | null) => void;
}

export function DeviceDashboard({ activeTool: controlledTool, onDeviceMeta }: DeviceDashboardProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const autoMirror = searchParams.get("autoMirror") === "1";
  const toast = useToast();

  const [device, setDevice] = useState<Device | null>(null);
  const [activeTransportId, setActiveTransportId] = useState<string | null>(null);

  const requestedTab = controlledTool || searchParams.get("tab");
  const activeTab: DeviceTool =
    requestedTab === "screen" ||
    requestedTab === "overview" ||
    requestedTab === "apps" ||
    requestedTab === "files" ||
    requestedTab === "console"
      ? requestedTab
      : "screen";

  useEffect(() => {
    const loadDevice = async () => {
      if (!id) return;
      try {
        const resolvedDevices = await deviceService.getResolvedDevices();
        const found = resolvedDevices.find(
          (d) => d.id === id || d.hardware_id === id || d.connections?.some((c) => c.id === id)
        );

        if (found) {
          setDevice(found);
          const matchingConn = found.connections?.find((c) => c.id === id);
          setActiveTransportId(matchingConn ? matchingConn.id : found.id);
        } else {
          toast.error("Device not found");
          navigate("/");
        }
      } catch (err) {
        console.error("Failed to load device details:", err);
        toast.error("Failed to load device details");
        navigate("/");
      }
    };

    loadDevice();
  }, [id, navigate, toast]);

  useEffect(() => {
    if (!device || !onDeviceMeta) return;
    const isConnected = device.status !== "Offline" && device.status !== "Disconnected";
    onDeviceMeta({
      id: device.id,
      name: device.name,
      model: device.model,
      isConnected,
    });
    return () => onDeviceMeta(null);
  }, [device, onDeviceMeta]);

  if (!device) {
    return (
      <div className="flex-1 flex items-center justify-center text-app-muted text-sm">
        Loading device…
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full min-h-0 bg-gray-50 dark:bg-[#0e1012] overflow-hidden">
      {/* Edge-to-edge content — no top bar / tab strip */}
      <main className="flex-1 min-h-0 overflow-hidden">
        {(activeTab === "screen" || activeTab === "overview") && (
          <div className="h-full min-h-0 animate-fade-in">
            <EmbeddedMirrorView
              deviceId={device.id}
              deviceName={device.name}
              connectionType={device.connection_type}
              deviceModel={device.model}
              deviceStatus={device.status}
              deviceIp={device.ip_address}
              availableConnections={device.connections}
              autoStart={autoMirror}
              fillWorkspace
              onRename={(newName) => {
                setDevice(prev => prev ? { ...prev, name: newName } : null);
              }}
              onTransportChange={setActiveTransportId}
            />
          </div>
        )}

        {activeTab === "apps" && (
          <div className="h-full w-full animate-fade-in relative">
            <AppManager deviceId={activeTransportId || device.id} />
          </div>
        )}

        {activeTab === "files" && (
          <div className="h-full w-full animate-fade-in relative">
            <FileManager deviceId={activeTransportId || device.id} />
          </div>
        )}

        {activeTab === "console" && (
          <div className="h-full w-full animate-fade-in relative">
            <ConsoleManager deviceId={activeTransportId || device.id} />
          </div>
        )}
      </main>
    </div>
  );
}
