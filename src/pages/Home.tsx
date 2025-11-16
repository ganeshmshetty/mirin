import { DeviceList } from "../components/DeviceList";

export function Home() {
  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">Scrcpy GUI</h1>
          <p className="text-gray-600">Android Device Screen Mirroring</p>
        </div>
        
        <DeviceList />
      </div>
    </div>
  );
}
