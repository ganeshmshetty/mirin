import { SettingsPanel } from "../components/SettingsPanel";

export function SettingsPage() {
  return (
    <div className="flex-1 overflow-hidden flex flex-col bg-white dark:bg-[#0e1012]">
      <SettingsPanel />
    </div>
  );
}
