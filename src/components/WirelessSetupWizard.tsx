import { useState } from "react";
import { deviceService } from "../services";
import type { Device } from "../types";

type WizardStep = "select" | "enable" | "disconnect" | "connect" | "complete";

interface WirelessSetupWizardProps {
  devices: Device[];
  onComplete: () => void;
  onCancel: () => void;
}

export function WirelessSetupWizard({
  devices,
  onComplete,
  onCancel,
}: WirelessSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState<WizardStep>("select");
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [deviceIP, setDeviceIP] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Filter USB devices
  const usbDevices = devices.filter(
    (d) => d.connection_type === "USB" && d.status === "Connected",
  );

  const handleSelectDevice = (device: Device) => {
    setSelectedDevice(device);
    setError(null);
  };

  const handleEnableWireless = async () => {
    if (!selectedDevice) return;

    setLoading(true);
    setError(null);

    try {
      const ip = await deviceService.enableWirelessMode(selectedDevice.id);
      setDeviceIP(ip);
      setCurrentStep("disconnect");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to enable wireless mode",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError(null);

    try {
      await deviceService.connectWireless(deviceIP);

      // Save the device for future use
      if (selectedDevice) {
        const wirelessDevice: Device = {
          ...selectedDevice,
          id: `${deviceIP}:5555`,
          connection_type: "Wireless",
          status: "Connected",
          ip_address: deviceIP,
          connections: [
            {
              id: `${deviceIP}:5555`,
              connection_type: "Wireless",
              status: "Connected",
              ip_address: deviceIP,
              port: 5555,
            },
          ],
        };
        try {
          await deviceService.saveDevice(wirelessDevice);
        } catch (saveErr) {
          console.error("Failed to save device:", saveErr);
          // Don't fail the whole operation if save fails
        }
      }

      setCurrentStep("complete");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to connect wirelessly",
      );
    } finally {
      setLoading(false);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case "select":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">
              Step 1: Select USB Device
            </h3>
            {usbDevices.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-600">No USB devices connected.</p>
                <p className="text-sm text-gray-500 mt-2">
                  Please connect a device via USB first.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {usbDevices.map((device) => (
                  <button
                    key={device.id}
                    onClick={() => handleSelectDevice(device)}
                    className={`w-full p-4 border-2 rounded-lg text-left transition-colors ${
                      selectedDevice?.id === device.id
                        ? "border-blue-500 bg-blue-50"
                        : "border-gray-300 hover:border-blue-300 hover:bg-gray-50"
                    }`}
                  >
                    <div className="font-medium">{device.name}</div>
                    <div className="text-sm text-gray-600">{device.model}</div>
                    <div className="text-xs text-gray-500 mt-1">
                      ID: {device.id}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setCurrentStep("enable")}
                disabled={!selectedDevice}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                Next
              </button>
            </div>
          </div>
        );

      case "enable":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">
              Step 2: Enable Wireless Mode
            </h3>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-900">
                <strong>Selected Device:</strong> {selectedDevice?.name}
              </p>
              <p className="text-sm text-blue-900 mt-1">
                <strong>Model:</strong> {selectedDevice?.model}
              </p>
            </div>
            <p className="text-gray-700 mb-4">
              Click "Enable Wireless" to switch your device to wireless
              debugging mode. This will allow you to connect to it over WiFi.
            </p>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-yellow-800">
                ⚠️ Make sure your device and computer are on the same WiFi
                network.
              </p>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep("select")}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                disabled={loading}
              >
                Back
              </button>
              <button
                onClick={handleEnableWireless}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? "Enabling..." : "Enable Wireless"}
              </button>
            </div>
          </div>
        );

      case "disconnect":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">
              Step 3: Disconnect USB Cable
            </h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-900">
                ✓ Wireless mode enabled successfully!
              </p>
              <p className="text-sm text-green-900 mt-2">
                <strong>Device IP:</strong> {deviceIP}
              </p>
            </div>
            <p className="text-gray-700 mb-4">
              You can now <strong>disconnect the USB cable</strong> from your
              device.
            </p>
            <p className="text-gray-700 mb-4">
              Once disconnected, click "Connect Wirelessly" to establish a
              wireless connection.
            </p>
            <div className="flex gap-3">
              <button
                onClick={onCancel}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={() => setCurrentStep("connect")}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Continue
              </button>
            </div>
          </div>
        );

      case "connect":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">
              Step 4: Connect Wirelessly
            </h3>
            <p className="text-gray-700 mb-4">
              Click "Connect" to establish a wireless connection to your device.
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-900">
                <strong>Connecting to:</strong> {deviceIP}:5555
              </p>
            </div>
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={() => setCurrentStep("disconnect")}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                disabled={loading}
              >
                Back
              </button>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-300"
              >
                {loading ? "Connecting..." : "Connect"}
              </button>
            </div>
          </div>
        );

      case "complete":
        return (
          <div>
            <h3 className="text-lg font-semibold mb-4">Setup Complete! 🎉</h3>
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-green-900">
                ✓ Your device is now connected wirelessly!
              </p>
              <p className="text-sm text-green-900 mt-2">
                <strong>Device:</strong> {selectedDevice?.name}
              </p>
              <p className="text-sm text-green-900 mt-1">
                <strong>IP Address:</strong> {deviceIP}
              </p>
            </div>
            <p className="text-gray-700 mb-4">
              Your device has been saved and will appear in the saved devices
              list. You can now start mirroring wirelessly!
            </p>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
              <p className="text-sm text-blue-900">
                💡 <strong>Tip:</strong> For future connections, you can connect
                directly from the saved devices list without going through this
                setup again.
              </p>
            </div>
            <button
              onClick={onComplete}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Wireless Setup Wizard
        </h2>
        <div className="flex items-center gap-2">
          {["select", "enable", "disconnect", "connect", "complete"].map(
            (step, index) => (
              <div key={step} className="flex items-center flex-1">
                <div
                  className={`h-2 rounded-full flex-1 ${
                    [
                      "select",
                      "enable",
                      "disconnect",
                      "connect",
                      "complete",
                    ].indexOf(currentStep) >= index
                      ? "bg-blue-600"
                      : "bg-gray-200"
                  }`}
                />
              </div>
            ),
          )}
        </div>
      </div>
      {renderStepContent()}
    </div>
  );
}
