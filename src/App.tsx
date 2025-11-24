import "./App.css";
import { Home } from "./pages/Home.tsx";
import { ToastProvider } from "./components/ToastProvider";
import { HelpButton } from "./components/HelpButton";

function App() {
  return (
    <ToastProvider>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50">
        {/* Header */}
        <header className="bg-white shadow-sm border-b border-gray-200">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              {/* Logo & Title */}
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                  </svg>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900">Scrcpy GUI</h1>
                  <p className="text-xs text-gray-500">Screen Mirroring Tool</p>
                </div>
              </div>
              
              {/* Actions */}
              <div className="flex items-center gap-2">
                <HelpButton />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="animate-fade-in">
          <Home />
        </main>
      </div>
    </ToastProvider>
  );
}

export default App;
