import "./App.css";
import { useState, useEffect, useCallback } from "react";
import { Routes, Route, useLocation, useSearchParams, useNavigate } from "react-router-dom";
import { Sidebar, type DeviceRailInfo } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { SettingsPage } from "./pages/SettingsPage";
import { DeviceDashboard } from "./pages/DeviceDashboard";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmDialogProvider } from "./components/ConfirmDialog";
import { InputDialogProvider } from "./components/InputDialog";
import { ConnectDeviceModal } from "./components/ConnectDeviceModal";
import { EmbeddedMirrorPopup } from "./components/EmbeddedMirrorPopup";
import { ThemeProvider } from "./components/ThemeProvider";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { settingsService, windowService } from "./services";

function AppContent() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [deviceRail, setDeviceRail] = useState<DeviceRailInfo | null>(null);
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  const navigate = useNavigate();

  const isDeviceRoute = location.pathname.startsWith("/device/");
  const deviceIdFromPath = isDeviceRoute
    ? decodeURIComponent(location.pathname.replace(/^\/device\//, ""))
    : null;
  const activeTool = searchParams.get("tab") || "screen";

  // Immediate rail shell while device details load
  const railForSidebar: DeviceRailInfo | null = isDeviceRoute
    ? deviceRail ??
      (deviceIdFromPath
        ? { id: deviceIdFromPath, name: "Loading…", isConnected: false }
        : null)
    : null;

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | undefined;

    // Apply alwaysOnTop preference on startup
    settingsService.loadSettings().then(settings => {
      getCurrentWindow().setAlwaysOnTop(settings.alwaysOnTop);
    }).catch(console.error);

    void import("@tauri-apps/api/event")
      .then(({ listen }) =>
        listen("device-connected", () => {
          setRefreshTrigger((prev) => prev + 1);
        })
      )
      .then((stopListening) => {
        if (disposed) stopListening();
        else unlisten = stopListening;
      })
      .catch((error) => {
        console.error("Failed to listen for device connections:", error);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (location.pathname === "/connect") {
      document.body.style.setProperty("background", "transparent", "important");
      document.documentElement.style.setProperty("background", "transparent", "important");
    } else {
      document.body.style.removeProperty("background");
      document.documentElement.style.removeProperty("background");
    }
  }, [location.pathname]);

  // Cmd+, to open settings (macOS convention)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "," && e.metaKey) {
        e.preventDefault();
        navigate("/settings");
      }
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [navigate]);

  // Clear device rail when leaving device routes
  useEffect(() => {
    if (!isDeviceRoute) {
      setDeviceRail(null);
    }
  }, [isDeviceRoute]);

  const handleDeviceMeta = useCallback((meta: DeviceRailInfo | null) => {
    setDeviceRail(meta);
  }, []);

  const handleToolChange = useCallback(
    (tool: string) => {
      setSearchParams({ tab: tool }, { replace: true });
    },
    [setSearchParams]
  );

  const handleConnectClick = async () => {
    try {
      await windowService.openConnectWindow();
    } catch (err) {
      console.error("Failed to open connect window:", err);
    }
  };

  const handleQuickMirrorClick = async () => {
    try {
      await windowService.openConnectWindow("quick-mirror");
    } catch (err) {
      console.error("Failed to open quick mirror window:", err);
    }
  };

  if (location.pathname === "/connect") {
    const mode = searchParams.get("mode") || "connect";
    return (
      <ConnectDeviceModal
        mode={mode}
        onClose={() => getCurrentWindow().close()}
        onDeviceConnected={() => {
          getCurrentWindow().close();
        }}
      />
    );
  }

  if (location.pathname.startsWith("/mirror/")) {
    return (
      <Routes>
        <Route path="/mirror/:id" element={<EmbeddedMirrorPopup />} />
      </Routes>
    );
  }

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-[#121315] text-gray-900 dark:text-[#cbd5e1] transition-colors overflow-hidden">
      <Sidebar
        onConnectClick={handleConnectClick}
        deviceRail={railForSidebar}
        activeTool={activeTool}
        onToolChange={handleToolChange}
      />
      <main className="flex-1 flex min-w-0 overflow-hidden">
        <div className="flex-1 flex w-full h-full min-w-0 min-h-0">
          <Routes>
            <Route
              path="/"
              element={
                <Home 
                  refreshTrigger={refreshTrigger} 
                  onConnectClick={handleConnectClick} 
                  onQuickMirrorClick={handleQuickMirrorClick}
                />
              }
            />
            <Route
              path="/settings"
              element={<SettingsPage />}
            />
            <Route
              path="/device/:id"
              element={
                <DeviceDashboard activeTool={activeTool} onDeviceMeta={handleDeviceMeta} />
              }
            />
          </Routes>
        </div>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <ConfirmDialogProvider>
        <InputDialogProvider>
          <ToastProvider>
            <AppContent />
          </ToastProvider>
        </InputDialogProvider>
      </ConfirmDialogProvider>
    </ThemeProvider>
  );
}

export default App;
