import { useState, useEffect, useRef } from "react";
import { Smartphone, Wifi, Usb, ArrowRight, CheckCircle2, ChevronRight, X } from "lucide-react";
import { deviceService } from "../services";
import type { Device } from "../types";

type Tab = "wireless" | "wired";
type WirelessStep = "instructions" | "searching" | "connect";

interface ConnectDeviceModalProps {
  onClose: () => void;
  onDeviceConnected?: () => void;
}

export function ConnectDeviceModal({ onClose, onDeviceConnected }: ConnectDeviceModalProps) {
  const [activeTab, setActiveTab] = useState<Tab>("wireless");
  const [wirelessStep, setWirelessStep] = useState<WirelessStep>("instructions");

  // Wireless Form State
  const [ipAddress, setIpAddress] = useState("");
  const [pairingPort, setPairingPort] = useState("");
  const [connectPort, setConnectPort] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedUsbDevices, setDetectedUsbDevices] = useState<Device[]>([]);

  // mDNS Discovery State
  const [discoveredDevices, setDiscoveredDevices] = useState<{instance_name: string, ip: string, pairing_port: string, connect_port: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const pollingRef = useRef(false);

  // Poll for mDNS services when in searching step
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    pollingRef.current = wirelessStep === "searching";

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
        
        const validDevices = Array.from(deviceMap.entries())
          .filter(([_, data]) => data.pairing_port !== "") // Must have at least pairing port
          .map(([name, data]) => ({ instance_name: name, ...data }));
          
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

    if (wirelessStep === "searching") {
      fetchServices();
    }

    return () => {
      pollingRef.current = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [wirelessStep]);

  // Poll for USB connection when in wired tab
  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout>;
    pollingRef.current = activeTab === "wired";

    const checkUsbDevice = async () => {
      if (!pollingRef.current) return;
      try {
        const connected = await deviceService.getConnectedDevices();
        const usbDevices = connected.filter(d => d.connection_type === "USB");
        setDetectedUsbDevices(usbDevices);
      } catch (err) {
        // ignore
      }
      
      if (pollingRef.current) {
        timeout = setTimeout(checkUsbDevice, 2000);
      }
    };

    if (activeTab === "wired") {
      checkUsbDevice();
    }

    return () => {
      pollingRef.current = false;
      if (timeout) clearTimeout(timeout);
    };
  }, [activeTab, onDeviceConnected, onClose]);

  const handlePairAndConnect = async () => {
    setError(null);
    if (!ipAddress || !pairingPort || !connectPort || !pairingCode) {
      setError("Please fill in all fields.");
      return;
    }
    
    const pPort = parseInt(pairingPort, 10);
    const cPort = parseInt(connectPort, 10);
    if (isNaN(pPort) || pPort < 1 || pPort > 65535) {
      setError("Invalid pairing port (must be 1-65535).");
      return;
    }
    if (isNaN(cPort) || cPort < 1 || cPort > 65535) {
      setError("Invalid connect port (must be 1-65535).");
      return;
    }
    if (!/^\d{6}$/.test(pairingCode.trim())) {
      setError("Pairing code must be exactly 6 digits.");
      return;
    }

    setLoading(true);
    try {
      // 1. Pair the device
      await deviceService.pairWireless(ipAddress, pPort, pairingCode.trim());
      
      // 2. Connect the device
      await deviceService.connectWireless(ipAddress, cPort);

      // Save it
      const device: Device = {
        id: `${ipAddress}:${cPort}`,
        name: `Device (${ipAddress})`,
        model: "Unknown",
        connection_type: "Wireless",
        status: "Connected",
        ip_address: ipAddress,
      };
      await deviceService.saveDevice(device).catch(() => {});
      
      onDeviceConnected?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to pair/connect.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header & Close */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
          <h2 id="modal-title" className="text-xl font-bold text-gray-900">Connect Device</h2>
          <button 
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex px-6 pt-4 gap-6 border-b border-gray-100" role="tablist">
          <button
            role="tab"
            aria-selected={activeTab === "wireless"}
            onClick={() => setActiveTab("wireless")}
            className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "wireless" 
                ? "border-cyan-500 text-cyan-600" 
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <div className="flex items-center gap-2">
              <Wifi size={16} />
              Wireless (Recommended)
            </div>
          </button>
          <button
            role="tab"
            aria-selected={activeTab === "wired"}
            onClick={() => setActiveTab("wired")}
            className={`pb-3 px-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === "wired" 
                ? "border-blue-500 text-blue-600" 
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            <div className="flex items-center gap-2">
              <Usb size={16} />
              Wired (USB)
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* WIRELESS TAB */}
          {activeTab === "wireless" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              
              {wirelessStep === "instructions" ? (
                <div className="flex flex-col items-center text-center">
                  <div className="w-32 h-32 bg-cyan-50 rounded-full flex items-center justify-center mb-6 relative">
                    <Smartphone size={48} className="text-cyan-600 z-10" />
                    {/* Placeholder for Lottie Animation */}
                    <div className="absolute inset-0 border-4 border-cyan-200 rounded-full animate-ping opacity-20" />
                    <div className="absolute inset-4 border-4 border-cyan-300 rounded-full animate-ping opacity-40 delay-150" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Android 11+ Pairing</h3>
                  <p className="text-gray-500 max-w-sm mb-8">
                    Connect your device over Wi-Fi without ever touching a USB cable.
                  </p>

                  <div className="w-full bg-gray-50 rounded-xl p-6 text-left space-y-4">
                    <div className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-white border-2 border-cyan-500 text-cyan-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                      <p className="text-sm text-gray-700">Open your phone's <strong>Settings &gt; Developer Options</strong>.</p>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-white border-2 border-cyan-500 text-cyan-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                      <p className="text-sm text-gray-700">Turn on <strong>Wireless Debugging</strong>.</p>
                    </div>
                    <div className="flex gap-4 items-start">
                      <div className="w-6 h-6 rounded-full bg-white border-2 border-cyan-500 text-cyan-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">3</div>
                      <p className="text-sm text-gray-700">Tap <strong>"Pair device with pairing code"</strong> to see your connection details.</p>
                    </div>
                  </div>

                  <button 
                    onClick={() => setWirelessStep("searching")}
                    className="mt-8 bg-cyan-500 hover:bg-cyan-600 text-white font-medium px-8 py-3 rounded-xl transition-all shadow-lg shadow-cyan-500/20 flex items-center gap-2"
                  >
                    Start Searching
                    <ArrowRight size={18} />
                  </button>
                </div>
              ) : wirelessStep === "searching" ? (
                <div className="flex flex-col items-center text-center">
                  <button 
                    onClick={() => setWirelessStep("instructions")}
                    className="self-start text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-8 transition-colors w-fit"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back
                  </button>

                  <div className="w-32 h-32 bg-cyan-50 rounded-full flex items-center justify-center mb-6 relative">
                    <Wifi size={48} className="text-cyan-600 z-10 animate-pulse" />
                    <div className="absolute inset-0 border-4 border-cyan-200 rounded-full animate-ping opacity-30" />
                    <div className="absolute inset-4 border-4 border-cyan-300 rounded-full animate-ping opacity-50 delay-150" />
                  </div>
                  
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Searching for Devices...</h3>
                  <p className="text-gray-500 max-w-sm mb-12">
                    Looking for Android devices on your Wi-Fi network with Wireless Debugging enabled.
                  </p>

                  <div className="w-full flex flex-col gap-3 max-w-sm">
                    {discoveredDevices.length > 0 ? (
                      <div className="space-y-2 mb-2">
                        {discoveredDevices.map((device, idx) => {
                          return (
                            <button 
                              key={`${device.instance_name}-${idx}`}
                              onClick={() => {
                                setIpAddress(device.ip);
                                setPairingPort(device.pairing_port);
                                setConnectPort(device.connect_port);
                                setWirelessStep("connect");
                              }}
                              className="w-full p-4 border border-cyan-200 bg-cyan-50 rounded-xl flex items-center gap-4 hover:border-cyan-400 transition-colors text-left"
                            >
                              <Smartphone className="text-cyan-600" />
                              <div>
                                <div className="font-bold text-gray-900">{device.instance_name}</div>
                                <div className="text-xs text-gray-500">Tap to pair • {device.ip}</div>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-4 text-sm text-gray-400">
                        {isSearching ? "Scanning..." : "No devices found yet."}
                      </div>
                    )}
                    
                    <button 
                      onClick={() => setWirelessStep("connect")}
                      className="w-full px-6 py-3 rounded-xl font-medium border-2 border-gray-200 text-gray-700 hover:border-gray-300 hover:bg-gray-50 transition-all flex items-center justify-center gap-2"
                    >
                      Pair Manually (IP Address)
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col">
                  <button 
                    onClick={() => setWirelessStep("searching")}
                    className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-6 transition-colors w-fit"
                  >
                    <ChevronRight size={16} className="rotate-180" />
                    Back to search
                  </button>

                  <h3 className="text-2xl font-bold text-gray-900 mb-6">Enter Pairing Details</h3>
                  
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">IP Address</label>
                      <input 
                        type="text" 
                        value={ipAddress}
                        onChange={(e) => setIpAddress(e.target.value)}
                        placeholder="192.168.1.100"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pairing Port</label>
                      <input 
                        type="text" 
                        value={pairingPort}
                        onChange={(e) => setPairingPort(e.target.value)}
                        placeholder="e.g. 38475"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                      />
                    </div>
                    <div className="col-span-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">Connect Port</label>
                      <input 
                        type="text" 
                        value={connectPort}
                        onChange={(e) => setConnectPort(e.target.value)}
                        placeholder="e.g. 40222"
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-1">6-Digit Pairing Code</label>
                    <input 
                      type="text" 
                      value={pairingCode}
                      onChange={(e) => setPairingCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all tracking-widest text-lg"
                    />
                  </div>

                  {error && (
                    <div className="p-4 bg-red-50 text-red-700 text-sm rounded-xl mb-6 border border-red-100">
                      {error}
                    </div>
                  )}

                  <div className="mt-auto flex justify-end gap-3 pt-6 border-t border-gray-100">
                    <button 
                      onClick={onClose}
                      className="px-6 py-2.5 rounded-xl font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handlePairAndConnect}
                      disabled={loading}
                      className="px-6 py-2.5 rounded-xl font-medium bg-cyan-500 hover:bg-cyan-600 text-white shadow-lg shadow-cyan-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {loading && <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                      Pair & Connect
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* WIRED TAB */}
          {activeTab === "wired" && (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 flex flex-col items-center text-center">
              <div className="w-32 h-32 bg-blue-50 rounded-full flex items-center justify-center mb-6">
                <Usb size={48} className="text-blue-600" />
                {/* Placeholder for Lottie Animation */}
              </div>
              
              <h3 className="text-2xl font-bold text-gray-900 mb-2">Connect via USB</h3>
              <p className="text-gray-500 max-w-sm mb-8">
                The fastest and most stable way to mirror your device.
              </p>

              <div className="w-full bg-gray-50 rounded-xl p-6 text-left space-y-4 mb-8">
                <div className="flex gap-4 items-start">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-blue-500 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">1</div>
                  <p className="text-sm text-gray-700">Connect your phone to your computer using a USB cable.</p>
                </div>
                <div className="flex gap-4 items-start">
                  <div className="w-6 h-6 rounded-full bg-white border-2 border-blue-500 text-blue-600 flex items-center justify-center font-bold text-xs shrink-0 mt-0.5">2</div>
                  <p className="text-sm text-gray-700">Ensure <strong>USB Debugging</strong> is enabled in Developer Options.</p>
                </div>
                <div className="flex gap-4 items-start bg-blue-100/50 p-3 rounded-lg mt-2">
                  <CheckCircle2 size={20} className="text-blue-600 shrink-0" />
                  <p className="text-sm text-blue-900 font-medium">Watch your phone screen! You must tap <strong>"Allow"</strong> when prompted.</p>
                </div>
              </div>

              {detectedUsbDevices.length > 0 ? (
                <div className="w-full flex flex-col gap-3">
                  <h4 className="text-sm font-semibold text-gray-700 text-left mb-1">Detected Devices:</h4>
                  {detectedUsbDevices.map((device, idx) => (
                    <button
                      key={`usb-${device.id}-${idx}`}
                      onClick={async () => {
                        await deviceService.saveDevice(device).catch(() => {});
                        onDeviceConnected?.();
                        onClose();
                      }}
                      className="w-full p-4 border border-blue-200 bg-blue-50 rounded-xl flex items-center justify-between hover:border-blue-400 transition-colors"
                    >
                      <div className="flex items-center gap-4 text-left">
                        <Smartphone className="text-blue-600" />
                        <div>
                          <div className="font-bold text-gray-900">{device.name}</div>
                          <div className="text-xs text-gray-500">{device.model} • Tap to save</div>
                        </div>
                      </div>
                      <ArrowRight size={18} className="text-blue-500" />
                    </button>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-gray-100 rounded-xl text-sm text-gray-600 w-full animate-pulse flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75" />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150" />
                  <span className="ml-2">Waiting for device connection...</span>
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
