import { useState, useEffect, useRef } from "react";
import { Smartphone, Wifi, Usb, ChevronLeft, X } from "lucide-react";
import { deviceService } from "../services";
import type { Device } from "../types";

type Step = "instructions" | "search-wireless" | "search-usb" | "manual-wireless";

interface ConnectDeviceModalProps {
  onClose: () => void;
  onDeviceConnected?: () => void;
}

export function ConnectDeviceModal({ onClose, onDeviceConnected }: ConnectDeviceModalProps) {
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

  // mDNS Discovery State
  const [discoveredDevices, setDiscoveredDevices] = useState<{instance_name: string, ip: string, pairing_port: string, connect_port: string}[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  // USB Discovery State
  const [detectedUsbDevices, setDetectedUsbDevices] = useState<Device[]>([]);

  const pollingRef = useRef(false);

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
        const usbDevices = connected.filter(d => d.connection_type === "USB");
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] transition-all duration-300">
        
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/80">
          <h2 id="modal-title" className="text-lg font-bold text-gray-900">Connect Device</h2>
          <button 
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1.5 rounded-full text-gray-400 hover:text-gray-700 hover:bg-gray-200 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 flex flex-col relative min-h-[320px]">
          
          {/* INSTRUCTIONS STEP (Unified) */}
          {step === "instructions" && (
            <div className="animate-in fade-in duration-300 flex flex-col justify-center h-full">
              <p className="text-gray-500 mb-6 text-center text-sm">
                Choose how you want to connect your Android device.
              </p>

              <div className="flex flex-col gap-4">
                
                {/* Wireless Choice */}
                <button 
                  onClick={() => {
                    setShowInstructions(false);
                    setStep("search-wireless");
                  }}
                  className="p-6 rounded-3xl border-2 border-gray-100 hover:border-cyan-400 hover:bg-cyan-50/30 bg-white shadow-sm hover:shadow-md transition-all flex items-center gap-5 group text-left active:scale-[0.98]"
                >
                  <div className="w-16 h-16 bg-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Wifi size={28}/>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-lg mb-1">Wireless <span className="text-cyan-600 text-xs bg-cyan-100 px-2 py-0.5 rounded-full ml-2 uppercase tracking-wide">Recommended</span></h4>
                    <p className="text-sm text-gray-500">Connect over Wi-Fi without a physical cable</p>
                  </div>
                </button>

                {/* Wired Choice */}
                <button 
                  onClick={() => {
                    setShowInstructions(false);
                    setStep("search-usb");
                  }}
                  className="p-6 rounded-3xl border-2 border-gray-100 hover:border-blue-400 hover:bg-blue-50/30 bg-white shadow-sm hover:shadow-md transition-all flex items-center gap-5 group text-left active:scale-[0.98]"
                >
                  <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300">
                    <Usb size={28}/>
                  </div>
                  <div>
                    <h4 className="font-bold text-gray-900 text-lg mb-1">Wired (USB)</h4>
                    <p className="text-sm text-gray-500">Connect using a fast and stable USB connection</p>
                  </div>
                </button>

              </div>
            </div>
          )}

          {/* SEARCH WIRELESS STEP */}
          {step === "search-wireless" && (
            <div className="animate-in fade-in duration-300 flex flex-col h-full w-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setStep("instructions")}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h3 className="text-lg font-bold text-gray-900">Searching Wi-Fi...</h3>
                </div>
                <button 
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="text-xs font-medium text-cyan-600 hover:text-cyan-700 bg-cyan-50 hover:bg-cyan-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {showInstructions ? "Hide Instructions" : "How to connect?"}
                </button>
              </div>

              {showInstructions && (
                <div className="mb-4 bg-cyan-50 border border-cyan-100 p-4 rounded-xl animate-in slide-in-from-top-2">
                  <div className="space-y-2 text-xs text-cyan-800">
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white flex items-center justify-center font-bold">1</span> Open <strong>Settings &gt; Developer Options</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white flex items-center justify-center font-bold">2</span> Turn on <strong>Wireless Debugging</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white flex items-center justify-center font-bold">3</span> Tap <strong>"Pair device with pairing code"</strong></p>
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
                  {discoveredDevices.length > 0 ? (
                    discoveredDevices.map((device, idx) => (
                      <div key={`wifi-${device.instance_name}-${idx}`} className="p-3 border border-cyan-200 bg-cyan-50/50 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-cyan-100 text-cyan-700 rounded-full flex items-center justify-center">
                            <Wifi size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-sm">{device.instance_name}</div>
                            <div className="text-xs text-gray-500">{device.ip}</div>
                          </div>
                        </div>
                        <button 
                          onClick={() => {
                            setIpAddress(device.ip);
                            setPairingPort(device.pairing_port);
                            setConnectPort(device.connect_port);
                            setStep("manual-wireless");
                          }}
                          className="px-4 py-2 bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        >
                          Connect
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <div className="w-16 h-16 bg-cyan-50 rounded-full flex items-center justify-center mb-4 relative">
                        <Wifi size={24} className="text-cyan-600 z-10 animate-pulse" />
                        <div className="absolute inset-0 border-2 border-cyan-200 rounded-full animate-ping opacity-30" />
                      </div>
                      <p className="text-sm text-gray-500">
                        {isSearching ? "Scanning network..." : "No devices found."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="pt-4 border-t border-gray-100 mt-auto">
                <button 
                  onClick={() => setStep("manual-wireless")}
                  className="w-full py-2.5 rounded-xl font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors text-sm"
                >
                  Pair Manually (IP Address)
                </button>
              </div>
            </div>
          )}

          {/* SEARCH USB STEP */}
          {step === "search-usb" && (
            <div className="animate-in fade-in duration-300 flex flex-col h-full w-full">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setStep("instructions")}
                    className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ChevronLeft size={20} />
                  </button>
                  <h3 className="text-lg font-bold text-gray-900">Searching USB...</h3>
                </div>
                <button 
                  onClick={() => setShowInstructions(!showInstructions)}
                  className="text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {showInstructions ? "Hide Instructions" : "How to connect?"}
                </button>
              </div>

              {showInstructions && (
                <div className="mb-4 bg-blue-50 border border-blue-100 p-4 rounded-xl animate-in slide-in-from-top-2">
                  <div className="space-y-2 text-xs text-blue-800">
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white flex items-center justify-center font-bold">1</span> Connect phone via <strong>USB cable</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white flex items-center justify-center font-bold">2</span> Enable <strong>USB Debugging</strong></p>
                    <p className="flex items-center gap-2"><span className="w-4 h-4 rounded-full bg-white flex items-center justify-center font-bold">3</span> Tap <strong>"Allow"</strong> on phone prompt</p>
                  </div>
                </div>
              )}

              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex-1 overflow-y-auto flex flex-col gap-3 pb-4">
                  {detectedUsbDevices.length > 0 ? (
                    detectedUsbDevices.map((device, idx) => (
                      <div key={`usb-${device.id}-${idx}`} className="p-3 border border-blue-200 bg-blue-50/50 rounded-xl flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-blue-100 text-blue-700 rounded-full flex items-center justify-center">
                            <Smartphone size={18} />
                          </div>
                          <div>
                            <div className="font-bold text-gray-900 text-sm">{device.name}</div>
                            <div className="text-xs text-gray-500">{device.model}</div>
                          </div>
                        </div>
                        <button 
                          onClick={async () => {
                            await deviceService.saveDevice(device).catch(() => {});
                            onDeviceConnected?.();
                            onClose();
                          }}
                          className="px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-lg transition-colors shadow-sm"
                        >
                          Connect
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center h-48 text-center">
                      <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4 relative">
                        <Usb size={24} className="text-blue-600 z-10 animate-pulse" />
                        <div className="absolute inset-0 border-2 border-blue-200 rounded-full animate-ping opacity-30" />
                      </div>
                      <p className="text-sm text-gray-500">
                        {isSearching ? "Scanning USB ports..." : "No devices found."}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {error && (
                <div className="w-full mt-4 p-3 bg-red-50 text-red-700 text-xs rounded-xl border border-red-100 flex flex-col gap-1 text-left">
                  <div className="font-bold">ADB Error:</div>
                  <div className="font-mono break-all">{error}</div>
                </div>
              )}
            </div>
          )}

          {/* MANUAL WIRELESS STEP */}
          {step === "manual-wireless" && (
            <div className="animate-in fade-in duration-300 flex flex-col h-full w-full">
              <div className="flex items-center gap-2 mb-6">
                <button 
                  onClick={() => setStep("search-wireless")}
                  className="p-1 text-gray-400 hover:text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <h3 className="text-lg font-bold text-gray-900">Pairing Details</h3>
              </div>
              
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">IP Address</label>
                  <input 
                    type="text" 
                    value={ipAddress}
                    onChange={(e) => setIpAddress(e.target.value)}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Pairing Port</label>
                  <input 
                    type="text" 
                    value={pairingPort}
                    onChange={(e) => setPairingPort(e.target.value)}
                    placeholder="38475"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Connect Port</label>
                  <input 
                    type="text" 
                    value={connectPort}
                    onChange={(e) => setConnectPort(e.target.value)}
                    placeholder="40222"
                    className="w-full px-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-xs font-medium text-gray-600 mb-1">6-Digit Pairing Code</label>
                <input 
                  type="text" 
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="123456"
                  className="w-full px-3 py-3 bg-gray-50 border border-gray-200 rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all tracking-widest text-lg text-center"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 text-red-700 text-xs rounded-lg mb-4 border border-red-100">
                  {error}
                </div>
              )}

              <div className="mt-auto pt-4 flex justify-end gap-2">
                <button 
                  onClick={onClose}
                  className="px-5 py-2.5 rounded-xl font-medium text-gray-600 hover:bg-gray-100 transition-colors text-sm"
                >
                  Cancel
                </button>
                <button 
                  onClick={handlePairAndConnect}
                  disabled={loading}
                  className="px-5 py-2.5 rounded-xl font-medium bg-cyan-500 hover:bg-cyan-600 text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                >
                  {loading && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                  Connect
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
