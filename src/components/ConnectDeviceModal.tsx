import { useState, useEffect, useRef } from "react";
import { Smartphone, Wifi, Usb, ChevronLeft, X, ArrowRight, RefreshCw } from "lucide-react";
import { deviceService, scrcpyService } from "../services";
import type { Device } from "../types";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LogicalSize } from "@tauri-apps/api/dpi";
import { emit } from "@tauri-apps/api/event";

type Step = "instructions" | "search-wireless" | "search-usb" | "manual-wireless" | "manual-connect";

const getErrorMessage = (err: unknown): string => {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  if (err && typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
};

interface ConnectDeviceModalProps {
  mode?: string;
  onClose: () => void;
  onDeviceConnected?: () => void;
}

export function ConnectDeviceModal({ mode = "connect", onClose, onDeviceConnected }: ConnectDeviceModalProps) {
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
  const [discoveredDevices, setDiscoveredDevices] = useState<{instance_name: string, ip: string, pairing_port: string, connect_port: string}[]>([]);
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
        // Adding ~50px to height to account for the p-6 (24px top+bottom) padding for shadows
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
        const deviceMap = new Map<string, {ip: string, pairing_port: string, connect_port: string}>();
        
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
          .filter(([_, data]) => data.pairing_port !== "" || data.connect_port !== "") // Must have pairing or connect info
          .map(([name, data]) => ({ instance_name: name, ...data }))
          .filter(d => !saved.some(s => s.ip_address === d.ip));
          
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
        const usbDevices = connected.filter(d => d.connection_type === "USB" && !saved.some(s => s.id === d.id));
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
      // Connect the device
      await deviceService.connectWireless(cleanIp, cPort);

      // Retry looking up the device (ADB may not update immediately).
      // Prefer the live ADB transport id (may be TLS serial, not ip:port).
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
          : [{
              id: deviceId,
              connection_type: "Wireless",
              status: "Connected",
              ip_address: connectedDevice?.ip_address || cleanIp,
            }],
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
        // Ensure exact data integrity assigning connection_type: "USB"
        const usbDeviceToSave: Device = {
          ...device,
          connection_type: "USB",
          status: "Connected",
          hardware_id: device.hardware_id || device.id,
          connections: device.connections || [{
            id: device.id,
            connection_type: "USB",
            status: "Connected",
          }],
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

  return (
    <div className="h-full w-full bg-transparent flex flex-col p-10 items-center justify-center">
      <div className="w-full h-full max-w-lg bg-gray-50 dark:bg-[#16191b] flex flex-col overflow-hidden rounded-xl shadow-[0_16px_40px_rgb(0,0,0,0.15)] dark:shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
        
        {/* Header */}
        <div data-tauri-drag-region className="relative px-4 py-3 flex items-center justify-end select-none border-b border-gray-200 dark:border-[#222629]">
          <h2 id="modal-title" data-tauri-drag-region className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-base font-bold text-app-text pointer-events-none">Connect Device</h2>
          <button 
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 rounded-full hover:rounded-md active:rounded-md focus:rounded-md text-app-muted hover:text-app-text hover:bg-app-hover transition-colors relative z-10"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col relative min-h-[280px] overflow-hidden">
          
          
          {/* INSTRUCTIONS STEP (Unified) */}
          {step === "instructions" && (
            <div className="flex flex-col justify-center h-full">
              <p className="text-gray-500 mb-5 text-center text-sm">
                Choose how you want to connect your Android device.
              </p>

              <div className="flex flex-col bg-white dark:bg-[#1d2327] rounded-2xl shadow-md overflow-hidden border border-gray-100 dark:border-[#2a3036]">
                
                {/* Wireless Choice */}
                <button 
                  onClick={() => {
                    setError(null);
                    setShowInstructions(false);
                    setStep("search-wireless");
                  }}
                  className="p-5 hover:bg-gray-50 dark:hover:bg-[#252c31] transition-colors flex items-center gap-4 group text-left cursor-pointer border-b border-gray-100 dark:border-[#2a3036]"
                >
                  <div className="w-12 h-12 bg-cyan-50 dark:bg-[#16191b] text-cyan-600 dark:text-cyan-400 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Wifi size={22}/>
                  </div>
                  <div>
                    <h4 className="font-bold text-app-text text-base mb-0.5 group-hover:text-cyan-700 dark:group-hover:text-cyan-400 transition-colors">Wireless</h4>
                    <p className="text-xs text-app-muted">Connect over Wi-Fi without a physical cable</p>
                  </div>
                  <div className="ml-auto text-gray-300 dark:text-gray-600 group-hover:text-cyan-500 group-hover:translate-x-1 transition-all">
                    <ArrowRight size={20} />
                  </div>
                </button>

                {/* Wired Choice */}
                <button 
                  onClick={() => {
                    setError(null);
                    setShowInstructions(false);
                    setStep("search-usb");
                  }}
                  className="p-5 hover:bg-gray-50 dark:hover:bg-[#252c31] transition-colors flex items-center gap-4 group text-left cursor-pointer"
                >
                  <div className="w-12 h-12 bg-cyan-50 dark:bg-[#16191b] text-cyan-600 dark:text-cyan-400 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Usb size={22}/>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 dark:text-slate-100 text-base mb-0.5 group-hover:text-cyan-700 dark:group-hover:text-cyan-400 transition-colors">Wired (USB)</h4>
                    <p className="text-xs text-gray-500 dark:text-slate-400">Connect using a fast and stable USB connection</p>
                  </div>
                  <div className="ml-auto text-gray-300 dark:text-gray-600 group-hover:text-cyan-500 group-hover:translate-x-1 transition-all">
                    <ArrowRight size={20} />
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* SEARCH WIRELESS STEP */}
          {step === "search-wireless" && (
            <div className="flex flex-col h-full w-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setStep("instructions")}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Searching Wi-Fi...</h3>
                </div>
                <button 
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 px-3 py-1.5 rounded-lg transition-colors border dark:border-cyan-900/40"
                >
                  {showInstructions ? "Hide Instructions" : "How to connect?"}
                </button>
              </div>

              {showInstructions && (
                <div className="mb-4 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/30 p-4 rounded-xl animate-in slide-in-from-top-2 text-gray-800 dark:text-slate-200">
                  <div className="space-y-2 text-xs">
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center font-bold">1</span> Open <strong>Settings &gt; Developer Options</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center font-bold">2</span> Turn on <strong>Wireless Debugging</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center font-bold">3</span> Tap <strong>"Pair device with pairing code"</strong></p>
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
                  {discoveredDevices.length > 0 ? (
                    discoveredDevices.map((device, idx) => (
                      <div key={`wifi-${device.instance_name}-${idx}`} className="p-4 bg-white dark:bg-[#1d2327] rounded-xl flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#252c31] transition-colors shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400 rounded-full flex items-center justify-center">
                            <Wifi size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 dark:text-slate-100 text-sm">{device.instance_name}</div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">{device.ip}</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setError(null);
                            setIpAddress(device.ip);
                            setPairingPort(device.pairing_port);
                            setConnectPort(device.connect_port);
                            if (device.connect_port && !device.pairing_port) {
                              setStep("manual-connect");
                            } else {
                              setStep("manual-wireless");
                            }
                          }}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        >
                          {device.connect_port && !device.pairing_port ? "Connect" : "Pair"}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <div className="w-16 h-16 bg-cyan-50 dark:bg-cyan-900/20 rounded-full flex items-center justify-center mb-4 relative">
                        <Wifi size={24} className="text-cyan-600 dark:text-cyan-400 z-10 animate-pulse" />
                        <div className="absolute inset-0 border-2 border-cyan-200 dark:border-cyan-900/50 rounded-full animate-ping opacity-30" />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        {isSearching ? "Scanning network..." : "No devices found."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="pt-4 border-t border-app-border mt-auto">
                <button 
                  onClick={() => setStep("manual-wireless")}
                  className="w-full py-2.5 rounded-xl font-medium border border-app-border text-app-muted hover:bg-app-hover transition-colors text-sm"
                >
                  Pair Manually (IP Address)
                </button>
              </div>
            </div>
          )}

          {/* SEARCH USB STEP */}
          {step === "search-usb" && (
            <div className="flex flex-col h-full w-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setStep("instructions")}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Searching USB...</h3>
                </div>
                <button 
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 bg-cyan-50 dark:bg-cyan-950/40 hover:bg-cyan-100 dark:hover:bg-cyan-900/30 px-3 py-1.5 rounded-lg transition-colors border dark:border-cyan-900/40"
                >
                  {showInstructions ? "Hide Instructions" : "How to connect?"}
                </button>
              </div>

              {showInstructions && (
                <div className="mb-4 bg-cyan-50 dark:bg-cyan-950/20 border border-cyan-100 dark:border-cyan-900/30 p-4 rounded-xl animate-in slide-in-from-top-2 text-gray-800 dark:text-slate-200">
                  <div className="space-y-2 text-xs">
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center font-bold">1</span> Connect phone via <strong>USB cable</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center font-bold">2</span> Enable <strong>USB Debugging</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white dark:bg-slate-700 flex items-center justify-center font-bold">3</span> Tap <strong>"Allow"</strong> on phone prompt</p>
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
                  {detectedUsbDevices.length > 0 ? (
                    detectedUsbDevices.map((device, idx) => (
                      <div key={`usb-${device.id}-${idx}`} className="p-4 bg-white dark:bg-[#1d2327] rounded-xl flex items-center justify-between hover:bg-gray-50 dark:hover:bg-[#252c31] transition-colors shadow-sm">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400 rounded-full flex items-center justify-center">
                            <Smartphone size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 dark:text-slate-100 text-sm">{device.name}</div>
                            <div className="text-xs text-gray-500 dark:text-slate-400">{device.model}</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => handleConnectUsb(device)}
                          disabled={connectingUsbId === device.id}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5"
                        >
                          {connectingUsbId === device.id ? (
                            <>
                              <RefreshCw className="animate-spin" size={14} />
                              Connecting...
                            </>
                          ) : (
                            "Connect"
                          )}
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <div className="w-16 h-16 bg-cyan-50 dark:bg-cyan-900/20 rounded-full flex items-center justify-center mb-4 relative">
                        <Usb size={24} className="text-cyan-600 dark:text-cyan-400 z-10 animate-pulse" />
                        <div className="absolute inset-0 border-2 border-cyan-200 dark:border-cyan-900/50 rounded-full animate-ping opacity-30" />
                      </div>
                      <p className="text-sm text-gray-500 dark:text-slate-400">
                        {isSearching ? "Scanning USB ports..." : "No devices found."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="w-full mt-4 p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs rounded-xl border border-red-100 dark:border-red-900/30 flex flex-col gap-1 text-left">
                  <div className="font-bold">ADB Error:</div>
                  <div className="font-mono break-all">{error}</div>
                </div>
              )}
            </div>
          )}

          {/* MANUAL WIRELESS STEP */}
          {step === "manual-wireless" && (
            <div className="flex flex-col h-full w-full">
              <div className="flex items-center gap-2 mb-6">
                <button 
                  onClick={() => setStep("search-wireless")}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Pairing Details</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-slate-400 mb-1">IP Address</label>
                  <input 
                    type="text" 
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 text-sm bg-app-input border border-app-border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all text-app-text"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-app-muted mb-1">Pairing Port</label>
                  <input 
                    type="text" 
                    value={pairingPort}
                    onChange={(e) => setPairingPort(e.target.value)}
                    placeholder="38475"
                    className="w-full px-3 py-2 text-sm bg-app-input border border-app-border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all text-app-text"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-app-muted mb-1">6-Digit Pairing Code</label>
                <input 
                  type="text" 
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-3 bg-app-input border border-app-border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all tracking-widest text-lg text-center text-app-text"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs rounded-lg mb-4 border border-red-100 dark:border-red-900/30">
                  {error}
                </div>
              )}

              <div className="mt-auto pt-4 flex justify-end gap-2">
                <button 
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl font-medium text-app-muted hover:bg-app-hover transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handlePair}
                  disabled={loading}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 active:bg-cyan-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {loading && <RefreshCw className="animate-spin" size={16} />}
                  Pair Device
                </button>
              </div>
            </div>
          )}

          {/* MANUAL CONNECT STEP */}
          {step === "manual-connect" && (
            <div className="flex flex-col h-full w-full">
              <div className="flex items-center gap-2 mb-6">
                <button 
                  onClick={() => setStep("manual-wireless")}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <h3 className="text-lg font-bold text-gray-900 dark:text-slate-100">Final Step: Connect</h3>
              </div>
              
              <div className="mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                  Successfully paired! Now close the pairing popup on your phone to see the <strong className="text-gray-900 dark:text-white">Connect Port</strong> on the main Wireless Debugging screen.
                </p>
                <label className="block text-xs font-medium text-app-muted mb-1">Connect Port</label>
                <input 
                  type="text" 
                  value={connectPort}
                  onChange={(e) => setConnectPort(e.target.value)}
                  placeholder="40222"
                  className="w-full px-3 py-3 bg-app-input border border-app-border rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all tracking-widest text-lg text-center text-app-text"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs rounded-lg mb-4 border border-red-100 dark:border-red-900/30">
                  {error}
                </div>
              )}

              <div className="mt-auto pt-4 flex justify-end gap-2">
                <button 
                  onClick={onClose}
                  className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleConnect}
                  disabled={loading}
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white font-medium rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {loading && <RefreshCw className="animate-spin" size={16} />}
                  Connect Device
                </button>
              </div>
            </div>
          )}
          
        </div>
      </div>
    </div>
  );
}
