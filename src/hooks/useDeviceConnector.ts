import { useState, useEffect, useRef } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit } from "@tauri-apps/api/event";
import { deviceService, scrcpyService } from "../services";
import type { Device } from "../types";
import { getErrorMessage } from "../utils";

export type Step =
  | "instructions"
  | "search-wireless"
  | "search-usb"
  | "manual-wireless"
  | "manual-connect";

interface UseDeviceConnectorProps {
  mode?: string;
  onClose: () => void;
  onDeviceConnected?: () => void;
}

export function useDeviceConnector({
  mode = "connect",
  onClose,
  onDeviceConnected,
}: UseDeviceConnectorProps) {
  const [step, setStep] = useState<Step>("instructions");
  const [showInstructions, setShowInstructions] = useState(false);

  // Wireless Form State
  const [ipAddress, setIpAddress] = useState("");
  const [pairingPort, setPairingPort] = useState("");
  const [connectPort, setConnectPort] = useState("");
  const [pairingCode, setPairingCode] = useState("");

  // Shared State
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectingUsbId, setConnectingUsbId] = useState<string | null>(null);

  // mDNS Discovery State
  const [discoveredDevices, setDiscoveredDevices] = useState<
    { instance_name: string; ip: string; pairing_port: string; connect_port: string }[]
  >([]);
  const [isSearching, setIsSearching] = useState(false);

  // USB Discovery State
  const [detectedUsbDevices, setDetectedUsbDevices] = useState<Device[]>([]);

  const pollingRef = useRef(false);

  // Resize window dynamically based on step
  useEffect(() => {
    const updateSize = async () => {
      try {
        const appWindow = getCurrentWindow();
        let height = 500;
        if (step === "instructions") height = 410;
        else if (step === "search-wireless" || step === "search-usb") height = 530;
        else if (step === "manual-wireless" || step === "manual-connect") height = 670;
        else height = 530;

        await appWindow.setSize(new LogicalSize(548, height));
      } catch (e) {
        console.error("Failed to resize window", e);
      }
    };
    updateSize();
  }, [step]);

  // Poll for mDNS services when in search-wireless step
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    pollingRef.current = step === "search-wireless";

    const fetchServices = async () => {
      if (!pollingRef.current) return;

      try {
        setIsSearching(true);
        const services = await deviceService.getMdnsServices();

        // Group pairing and connecting services by instance_name
        const deviceMap = new Map<string, { ip: string; pairing_port: string; connect_port: string }>();

        for (const s of services) {
          const parts = s.address.split(":");
          const ip = parts[0];
          const port = parts[1] || "";

          if (!deviceMap.has(s.instance_name)) {
            deviceMap.set(s.instance_name, { ip, pairing_port: "", connect_port: "" });
          }
          const entry = deviceMap.get(s.instance_name)!;

          if (s.service_type.includes("adb-tls-pairing")) {
            entry.pairing_port = port;
          } else if (s.service_type.includes("adb-tls-connect")) {
            entry.connect_port = port;
          }
        }

        const saved = await deviceService.getSavedDevices();
        const validDevices = Array.from(deviceMap.entries())
          .filter(([_, data]) => data.pairing_port !== "" || data.connect_port !== "")
          .map(([name, data]) => ({ instance_name: name, ...data }))
          .filter((d) => !saved.some((s) => s.ip_address === d.ip));

        setDiscoveredDevices(validDevices);
      } catch (err) {
        console.error("Failed to discover mDNS services:", err);
      } finally {
        setIsSearching(false);
        if (pollingRef.current) {
          timeout = setTimeout(fetchServices, 3000);
        }
      }
    };

    if (step === "search-wireless") {
      fetchServices();
    }

    return () => {
      pollingRef.current = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [step]);

  // Poll for USB connection when in search-usb step
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    pollingRef.current = step === "search-usb";

    const checkUsbDevice = async () => {
      if (!pollingRef.current) return;
      try {
        setIsSearching(true);
        const connected = await deviceService.getConnectedDevices();
        const saved = await deviceService.getSavedDevices();
        const usbDevices = connected.filter(
          (d) => d.connection_type === "USB" && !saved.some((s) => s.id === d.id)
        );
        setDetectedUsbDevices(usbDevices);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setIsSearching(false);
      }

      if (pollingRef.current) {
        timeout = setTimeout(checkUsbDevice, 2000);
      }
    };

    if (step === "search-usb") {
      checkUsbDevice();
    }

    return () => {
      pollingRef.current = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [step]);

  const handlePair = async () => {
    setError(null);
    const cleanIp = ipAddress.trim();
    const cleanPort = pairingPort.trim();
    const cleanCode = pairingCode.trim();

    if (!cleanIp || !cleanPort || !cleanCode) {
      setError("Please fill in all fields.");
      return;
    }

    const pPort = parseInt(cleanPort, 10);
    if (isNaN(pPort) || pPort < 1 || pPort > 65535) {
      setError("Invalid pairing port (must be 1-65535).");
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Pairing code must be exactly 6 digits.");
      return;
    }

    setLoading(true);
    try {
      await deviceService.pairWireless(cleanIp, pPort, cleanCode);
      setStep("manual-connect");
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setError(null);
    const cleanIp = ipAddress.trim();
    const cleanPort = connectPort.trim();

    if (!cleanPort) {
      setError("Please enter the connect port.");
      return;
    }

    const cPort = parseInt(cleanPort, 10);
    if (isNaN(cPort) || cPort < 1 || cPort > 65535) {
      setError("Invalid connect port (must be 1-65535).");
      return;
    }

    setLoading(true);
    try {
      await deviceService.connectWireless(cleanIp, cPort);

      const connectedDevice = await deviceService.findConnectedAfterConnect(cleanIp, cPort);

      const deviceId = connectedDevice?.id || `${cleanIp}:${cPort}`;
      const device: Device = {
        hardware_id: connectedDevice?.hardware_id || deviceId,
        id: deviceId,
        name: connectedDevice?.name || `Device (${cleanIp})`,
        model: connectedDevice?.model || "Unknown",
        connection_type: "Wireless",
        status: "Connected",
        ip_address: connectedDevice?.ip_address || cleanIp,
        connections: connectedDevice?.connections?.length
          ? connectedDevice.connections
          : [
              {
                id: deviceId,
                connection_type: "Wireless",
                status: "Connected",
                ip_address: connectedDevice?.ip_address || cleanIp,
              },
            ],
      };

      if (mode !== "quick-mirror") {
        await deviceService.saveDevice(device).catch((saveErr) => {
          console.error("Failed to save device:", saveErr);
        });
        await emit("device-connected");
      } else {
        await scrcpyService.openMirrorWindow(device.id, device.name).catch((err) => {
          console.error("Failed to open quick mirror window:", err);
        });
      }

      onDeviceConnected?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleConnectUsb = async (device: Device) => {
    setError(null);
    setConnectingUsbId(device.id);
    try {
      if (mode !== "quick-mirror") {
        const usbDeviceToSave: Device = {
          ...device,
          connection_type: "USB",
          status: "Connected",
          hardware_id: device.hardware_id || device.id,
          connections: device.connections || [
            {
              id: device.id,
              connection_type: "USB",
              status: "Connected",
            },
          ],
        };
        await deviceService.saveDevice(usbDeviceToSave);
        await emit("device-connected");
      } else {
        await scrcpyService.openMirrorWindow(device.id, device.name).catch((err) => {
          console.error("Failed to open quick mirror window:", err);
        });
      }
      onDeviceConnected?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setConnectingUsbId(null);
    }
  };

  return {
    step,
    setStep,
    showInstructions,
    setShowInstructions,
    ipAddress,
    setIpAddress,
    pairingPort,
    setPairingPort,
    connectPort,
    setConnectPort,
    pairingCode,
    setPairingCode,
    loading,
    error,
    setError,
    connectingUsbId,
    discoveredDevices,
    isSearching,
    detectedUsbDevices,
    handlePair,
    handleConnect,
    handleConnectUsb,
  };
}
