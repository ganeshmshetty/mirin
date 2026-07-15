import "./App.css";
import { useState, useEffect } from "react";
import { Routes, Route, useLocation } from "react-router-dom";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { SettingsPage } from "./pages/SettingsPage";
import { DeviceDashboard } from "./pages/DeviceDashboard";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmDialogProvider } from "./components/ConfirmDialog";
import { InputDialogProvider } from "./components/InputDialog";
import { ConnectDeviceModal } from "./components/ConnectDeviceModal";
import { ThemeProvider } from "./components/ThemeProvider";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";

function AppContent() {
  const [activeTab, setActiveTab] = useState("home");
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const location = useLocation();

  useEffect(() => {
    import("@tauri-apps/api/event").then(({ listen }) => {
      const unlisten = listen("device-connected", () => {
        setRefreshTrigger((prev) => prev + 1);
      });
      return () => {
        unlisten.then((f) => f());
      };
    });
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

  if (location.pathname === "/connect") {
    return (
      <ConnectDeviceModal 
        onClose={() => getCurrentWindow().close()}
        onDeviceConnected={() => {
          getCurrentWindow().close();
        }}
      />
    );
  }

  const handleConnectClick = async () => {
    try {
      await invoke("open_connect_window");
    } catch (err) {
      console.error("Failed to open connect window:", err);
    }
  };

  return (
    <div className="h-screen flex bg-gray-50 dark:bg-[#121315] text-gray-900 dark:text-[#cbd5e1] transition-colors">
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={(tab) => {
          setActiveTab(tab);
          // Optional: If they are on a device page and click a sidebar tab, navigate home
          if (location.pathname !== "/") {
            window.location.hash = "/";
          }
        }} 
        onConnectClick={handleConnectClick} 
      />
      <main className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex w-full h-full">
          <Routes>
            <Route path="/" element={
              activeTab === "home" ? (
                <Home 
                  refreshTrigger={refreshTrigger} 
                  onConnectClick={handleConnectClick} 
                />
              ) : (
                <SettingsPage />
              )
            } />
            <Route path="/device/:id" element={<DeviceDashboard />} />
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
