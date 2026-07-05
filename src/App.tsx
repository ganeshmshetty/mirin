import "./App.css";
import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { Home } from "./pages/Home";
import { SettingsPage } from "./pages/SettingsPage";
import { ToastProvider } from "./components/ToastProvider";
import { ConfirmDialogProvider } from "./components/ConfirmDialog";
import { InputDialogProvider } from "./components/InputDialog";
import { ConnectDeviceModal } from "./components/ConnectDeviceModal";
import { ThemeProvider } from "./components/ThemeProvider";

function App() {
  const [activeTab, setActiveTab] = useState("home");
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  return (
    <ThemeProvider>
      <ConfirmDialogProvider>
        <InputDialogProvider>
          <ToastProvider>
            <div className="h-screen flex bg-gray-50 dark:bg-[#121315] text-gray-900 dark:text-[#cbd5e1] transition-colors">
              {/* Sidebar */}
              <Sidebar 
                activeTab={activeTab} 
                onTabChange={setActiveTab} 
                onConnectClick={() => setShowConnectModal(true)} 
              />

              {/* Main Content */}
              <main className="flex-1 flex overflow-hidden">
                <div key={activeTab} className="flex-1 flex w-full h-full animate-simple-fade">
                  {activeTab === "home" && (
                    <Home 
                      refreshTrigger={refreshTrigger} 
                      onConnectClick={() => setShowConnectModal(true)} 
                    />
                  )}
                  {activeTab === "settings" && <SettingsPage />}
                </div>
              </main>

              {showConnectModal && (
                <ConnectDeviceModal 
                  onClose={() => setShowConnectModal(false)}
                  onDeviceConnected={() => setRefreshTrigger(prev => prev + 1)}
                />
              )}
            </div>
          </ToastProvider>
        </InputDialogProvider>
      </ConfirmDialogProvider>
    </ThemeProvider>
  );
}

export default App;
