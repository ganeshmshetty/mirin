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
        const connectedDevices = await deviceService.getConnectedDevices();
        // Try direct id match first, then fallback to hardware_id (supports
        // navigation from merged entries where id may be wireless IP:port or USB serial)
        let found = connectedDevices.find((d) => d.id === id);
        if (!found) {
          found = connectedDevices.find((d) => d.hardware_id === id);
        }

        if (found) {
          // Gather all sibling connections sharing the same hardware_id
          const siblings = connectedDevices.filter(
            d => d.hardware_id && d.hardware_id === found!.hardware_id && d.id !== found!.id
          );
          if (siblings.length > 0) {
            found = {
              ...found,
              connections: [
                ...(found.connections || []),
                ...siblings.flatMap(s => s.connections || []),
              ],
            };
          }
          setDevice(found);
          setActiveTransportId(found.id);
        } else {
          const savedDevices = await deviceService.getSavedDevices();
          const savedFound = savedDevices.find((d) => d.id === id)
            || savedDevices.find((d) => d.hardware_id === id);
          if (savedFound) {
            setDevice({ ...savedFound, status: "Offline" });
            setActiveTransportId(savedFound.id);
          } else {
            toast.error("Device not found");
            navigate("/");
          }
        }
      } catch (err) {
        console.error("Failed to load device details:", err);
        toast.error("Failed to load device details");
        navigate("/");
      }
    };

    if (id) loadDevice();
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
