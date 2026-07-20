import { useState } from "react";
import { X, Wifi, RefreshCw } from "lucide-react";
import { deviceService } from "../services";
import { emit } from "@tauri-apps/api/event";
import { getErrorMessage } from "../utils";
import type { Device } from "../types";

interface WifiPairPanelProps {
  onClose: () => void;
  onDeviceConnected: () => void;
}

type PanelStep = "pair" | "connect";

export function WifiPairPanel({ onClose, onDeviceConnected }: WifiPairPanelProps) {
  const [step, setStep] = useState<PanelStep>("pair");

  // Form state
  const [ipAddress, setIpAddress] = useState("");
  const [pairingPort, setPairingPort] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [connectPort, setConnectPort] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Invalid pairing port (1–65535).");
      return;
    }
    if (!/^\d{6}$/.test(cleanCode)) {
      setError("Pairing code must be exactly 6 digits.");
      return;
    }

    setLoading(true);
    try {
      await deviceService.pairWireless(cleanIp, pPort, cleanCode);
      setStep("connect");
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

    if (!cleanIp || !cleanPort) {
      setError("Please enter the connect port.");
      return;
    }
    const cPort = parseInt(cleanPort, 10);
    if (isNaN(cPort) || cPort < 1 || cPort > 65535) {
      setError("Invalid connect port (1–65535).");
      return;
    }

    setLoading(true);
    try {
      await deviceService.connectWireless(cleanIp, cPort);
      const connected = await deviceService.findConnectedAfterConnect(cleanIp, cPort);
      const deviceId = connected?.id || `${cleanIp}:${cPort}`;
      const device: Device = {
        hardware_id: connected?.hardware_id || deviceId,
        id: deviceId,
        name: connected?.name || `Device (${cleanIp})`,
        model: connected?.model || "Unknown",
        connection_type: "Wireless",
        status: "Connected",
        ip_address: connected?.ip_address || cleanIp,
        connections: connected?.connections?.length
          ? connected.connections
          : [{ id: deviceId, connection_type: "Wireless", status: "Connected", ip_address: cleanIp }],
        favorite: false,
      };
      await deviceService.saveDevice(device).catch(console.error);
      await emit("device-connected");
      onDeviceConnected();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    /* Backdrop */
    <div
      className="absolute inset-0 z-40 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] flex items-stretch justify-end"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Panel */}
      <div className="w-80 h-full bg-white dark:bg-[#16191b] border-l border-gray-200 dark:border-[#222629] flex flex-col shadow-2xl animate-slide-in-right">
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-gray-100 dark:border-[#222629] flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
              <Wifi size={14} className="text-cyan-600 dark:text-cyan-400" />
            </div>
            <span className="font-semibold text-sm text-gray-900 dark:text-slate-100">
              {step === "pair" ? "Pair via Wi-Fi" : "Connect"}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 dark:hover:text-slate-200 hover:bg-gray-100 dark:hover:bg-[#1d2327] transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          {step === "pair" ? (
            <>
              {/* Instructions */}
              <div className="bg-cyan-50 dark:bg-cyan-950/30 border border-cyan-100 dark:border-cyan-900/40 rounded-xl p-3.5 text-xs text-gray-600 dark:text-slate-300 space-y-1.5">
                <p className="font-medium text-cyan-700 dark:text-cyan-400 mb-2">On your Android phone:</p>
                <p>1. Open <strong>Settings → Developer options</strong></p>
                <p>2. Enable <strong>Wireless debugging</strong></p>
                <p>3. Tap <strong>Pair device with pairing code</strong></p>
                <p>4. Enter the details shown below</p>
              </div>

              {/* IP Address */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
                  IP Address
                </label>
                <input
                  type="text"
                  value={ipAddress}
                  onChange={(e) => setIpAddress(e.target.value)}
                  placeholder="192.168.1.100"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-[#1d2327] border border-gray-200 dark:border-[#2a3036] rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all text-gray-900 dark:text-slate-100"
                />
              </div>

              {/* Pairing Port */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
                  Pairing Port
                </label>
                <input
                  type="text"
                  value={pairingPort}
                  onChange={(e) => setPairingPort(e.target.value)}
                  placeholder="38475"
                  className="w-full px-3 py-2.5 text-sm bg-gray-50 dark:bg-[#1d2327] border border-gray-200 dark:border-[#2a3036] rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all text-gray-900 dark:text-slate-100"
                />
              </div>

              {/* Pairing Code */}
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
                  Pairing Code
                </label>
                <input
                  type="text"
                  value={pairingCode}
                  onChange={(e) => setPairingCode(e.target.value)}
                  placeholder="123456"
                  maxLength={6}
                  className="w-full px-3 py-3 text-xl text-center tracking-[0.4em] bg-gray-50 dark:bg-[#1d2327] border border-gray-200 dark:border-[#2a3036] rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all text-gray-900 dark:text-slate-100 font-mono"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-900/30">
                  {error}
                </div>
              )}

              <button
                onClick={handlePair}
                disabled={loading}
                className="mt-auto w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {loading && <RefreshCw size={14} className="animate-spin" />}
                Pair Device
              </button>
            </>
          ) : (
            <>
              <div className="bg-green-50 dark:bg-green-950/20 border border-green-100 dark:border-green-900/30 rounded-xl p-3.5 text-xs text-gray-600 dark:text-slate-300">
                <p className="font-medium text-green-700 dark:text-green-400 mb-1">Pairing successful!</p>
                <p>Enter the <strong>connection port</strong> shown under Wireless debugging on your phone.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-slate-400 mb-1.5">
                  Connect Port
                </label>
                <input
                  type="text"
                  value={connectPort}
                  onChange={(e) => setConnectPort(e.target.value)}
                  placeholder="40222"
                  className="w-full px-3 py-3 text-xl text-center tracking-[0.4em] bg-gray-50 dark:bg-[#1d2327] border border-gray-200 dark:border-[#2a3036] rounded-lg focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 outline-none transition-all text-gray-900 dark:text-slate-100 font-mono"
                />
              </div>

              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-900/30">
                  {error}
                </div>
              )}

              <button
                onClick={handleConnect}
                disabled={loading}
                className="mt-auto w-full py-2.5 bg-cyan-600 hover:bg-cyan-700 active:bg-cyan-800 text-white font-medium rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
              >
                {loading && <RefreshCw size={14} className="animate-spin" />}
                Connect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
