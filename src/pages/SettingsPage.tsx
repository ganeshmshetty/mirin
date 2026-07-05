import { SettingsPanel } from "../components/SettingsPanel";

export function SettingsPage() {
    return (
        <div className="flex-1 flex flex-col">
            <header className="h-14 bg-white dark:bg-[#16191b] border-b border-gray-200 dark:border-[#222629] flex items-center px-6 flex-shrink-0 transition-colors">
                <h2 className="text-lg font-semibold text-gray-800 dark:text-slate-100">Settings</h2>
            </header>
            <div className="flex-1 p-6 overflow-auto">
                <SettingsPanel />
            </div>
        </div>
    );
}
