import { AlertCircle, Trash2, MoreVertical, Edit2, Plus, Smartphone, Zap } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Device } from "../types";
import { useInputDialog } from "./InputDialog";
import { MirrorButton } from "./MirrorButton";
import logo from "../assets/logo.svg";

interface DeviceTableProps {
    devices: Device[];
    onRemoveDevice: (deviceId: string) => void;
    onRenameDevice: (deviceId: string, newName: string) => void;
    onConnectClick?: () => void;
    onQuickMirrorClick?: () => void;
}

export function DeviceTable({
    devices,
    onRemoveDevice,
    onRenameDevice,
    onConnectClick,
    onQuickMirrorClick,
}: DeviceTableProps) {
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
    const [mirrorStatuses, setMirrorStatuses] = useState<Record<string, string>>({});
    const menuRef = useRef<HTMLDivElement>(null);
    const { prompt } = useInputDialog();
    const navigate = useNavigate();

    useEffect(() => {
        const handleMirrorStatus = (e: CustomEvent<{ deviceId: string, status: string }>) => {
            setMirrorStatuses(prev => ({
                ...prev,
                [e.detail.deviceId]: e.detail.status
            }));
        };
        window.addEventListener('mirror-status', handleMirrorStatus as EventListener);
        return () => window.removeEventListener('mirror-status', handleMirrorStatus as EventListener);
    }, []);

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            const target = event.target as HTMLElement;
            if (target.closest('[data-menu-toggle]')) return;

            if (menuRef.current && !menuRef.current.contains(target as Node)) {
                setOpenMenuId(null);
            }
        }

        function handleScroll() {
            if (openMenuId) setOpenMenuId(null);
        }

        document.addEventListener("mousedown", handleClickOutside);
        window.addEventListener("scroll", handleScroll, true);
        window.addEventListener("resize", handleScroll);

        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
            window.removeEventListener("scroll", handleScroll, true);
            window.removeEventListener("resize", handleScroll);
        };
    }, [openMenuId]);

    const activeDevice = devices.find(d => d.id === openMenuId);

    if (devices.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
                <img 
                    src={logo} 
                    alt="Mirin" 
                    className="w-24 h-24 mb-6 object-contain" 
                />
                <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-1">No devices connected</h3>
                <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs mx-auto">
                    Connect your device to get started.
                </p>
                <button
                    onClick={onConnectClick}
                    className="mt-6 px-6 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 transition-all shadow-sm active:scale-95 inline-flex items-center gap-2"
                >
                    <Plus size={16} />
                    Connect Device
                </button>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0 bg-slate-100 dark:bg-[#111315]">
            <div className="max-w-xl mx-auto w-full flex-1 flex flex-col min-h-0">
            <div className="flex flex-col">
            {devices.map((device) => {
                const isMenuOpen = openMenuId === device.id;
                const isOffline = device.status === "Offline";
                const isUnauthorized = device.status === "Unauthorized";

                return (
                    <div
                        key={device.id}
                        role="link"
                        tabIndex={0}
                        onClick={() => navigate(`/device/${encodeURIComponent(device.id)}?tab=screen`)}
                        onKeyDown={(event) => {
                            if (event.target === event.currentTarget && event.key === "Enter") {
                                navigate(`/device/${encodeURIComponent(device.id)}?tab=screen`);
                            }
                        }}
                        className="group relative flex items-center gap-4 py-5 px-5 bg-white dark:bg-[#16191b] hover:bg-gray-50 dark:hover:bg-[#1d2327]/50 transition-colors border border-gray-200 dark:border-[#222629] rounded-none first:rounded-t-xl last:rounded-b-xl -mb-px last:mb-0"
                    >
                        {/* 1. Icon */}
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors bg-gray-50 dark:bg-[#1d2327] text-gray-500 dark:text-slate-400 group-hover:bg-gray-100 dark:group-hover:bg-[#252c31]">
                            <Smartphone size={20} />
                        </div>

                        {/* 2. Info */}
                        <div className="flex-1 min-w-0">
                            <h4 className="font-medium truncate text-gray-900 dark:text-slate-100">
                                {device.name}
                            </h4>
                            <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 font-medium mt-0.5 capitalize">
                                <span>{device.status}</span>
                                {device.connection_type && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-[#2f353a]" />
                                        <span className="uppercase">{device.connection_type}</span>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* 3. Status & Actions */}
                        <div className="flex items-center gap-3">
                            {/* Connection Status Pill */}
                            {isUnauthorized ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium border border-yellow-100 dark:border-yellow-900/50">
                                    <AlertCircle size={12} />
                                    Unauthorized
                                </span>
                            ) : isOffline ? (
                                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#1c2023] text-gray-500 dark:text-slate-300 text-xs font-medium border border-transparent dark:border-[#222629]">
                                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-slate-500" />
                                    Offline
                                </span>
                            ) : (
                                <div className="hidden sm:flex items-center gap-3 pr-2">
                                    <div 
                                        className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]" 
                                        title="Connected" 
                                    />
                                    {mirrorStatuses[device.id] === "streaming" && (
                                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-900/50">
                                            <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                                            Mirroring
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Mirror Action */}
                            {device.status === "Connected" && (
                                <MirrorButton
                                    size="sm"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        navigate(`/device/${encodeURIComponent(device.id)}?tab=screen`);
                                    }}
                                    title="Quick mirror — skip device details"
                                    className="relative z-10"
                                />
                            )}

                            {/* Context Menu Toggle */}
                            <button
                                data-menu-toggle={device.id}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    setMenuPosition({
                                        top: rect.bottom + 8,
                                        right: window.innerWidth - rect.right
                                    });
                                    setOpenMenuId(isMenuOpen ? null : device.id);
                                }}
                                className={`p-2 rounded-lg transition-colors relative z-10 outline-none ${isMenuOpen
                                    ? "bg-gray-100 dark:bg-[#1c2023] text-gray-900 dark:text-slate-100"
                                    : "text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-[#1d2327] hover:text-gray-600 dark:hover:text-slate-300"
                                    }`}
                            >
                                <MoreVertical size={18} />
                            </button>
                        </div>
                    </div>
                );
            })}
            </div>
            
            {/* Quick Mirror Button at the bottom */}
            {devices.length > 0 && (
                <>
                    <div className="flex-1" />
                    <div className="border-t border-dashed border-gray-300 dark:border-[#2f353a]" />
                    <div className="flex items-center justify-center pt-6">
                        <button
                            onClick={onQuickMirrorClick}
                            className="px-6 py-3 bg-cyan-50 dark:bg-cyan-900/20 hover:bg-cyan-100 dark:hover:bg-cyan-900/40 text-cyan-700 dark:text-cyan-400 font-semibold rounded-xl transition-all shadow-sm active:scale-95 text-sm flex items-center gap-2 border border-cyan-200 dark:border-cyan-800"
                        >
                            <Zap size={18} className="fill-current" />
                            Quick Mirror
                        </button>
                    </div>
                </>
            )}
            </div>

            {/* Fixed Menu Rendering */}
            {openMenuId && activeDevice && menuPosition && (
                <div
                    ref={menuRef}
                    style={{
                        position: 'fixed',
                        top: menuPosition.top,
                        right: menuPosition.right,
                        zIndex: 9999
                    }}
                    className="w-40 dropdown-menu animate-scale-in origin-top-right"
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={async () => {
                            const newName = await prompt({
                                title: "Rename Device",
                                defaultValue: activeDevice.name,
                                confirmText: "Rename",
                                placeholder: "Enter new name"
                            });
                            if (newName && newName !== activeDevice.name) {
                                onRenameDevice(activeDevice.id, newName);
                            }
                            setOpenMenuId(null);
                        }}
                        className="dropdown-item"
                    >
                        <Edit2 size={14} className="text-gray-400 dark:text-slate-400" />
                        Rename
                    </button>
                    <button
                        onClick={() => {
                            onRemoveDevice(activeDevice.id);
                            setOpenMenuId(null);
                        }}
                        className="dropdown-item-danger"
                    >
                        <Trash2 size={14} />
                        Forget
                    </button>
                </div>
            )}
        </div>
    );
}
