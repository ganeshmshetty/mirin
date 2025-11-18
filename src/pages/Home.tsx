import { DeviceList } from "../components/DeviceList";
import { ActiveSessions } from "../components/ActiveSessions";
import { ProcessManager } from "../components/ProcessManager";

export function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Scrcpy GUI</h1>
          <p className="text-gray-600">Android Device Screen Mirroring</p>
        </div>
        
        {/* Process Manager */}
        <div className="mb-6">
          <ProcessManager />
        </div>

        {/* Active Sessions */}
        <div className="mb-6">
          <ActiveSessions />
        </div>

        {/* Device List */}
        <DeviceList />
      </div>
    </div>
  );
}
