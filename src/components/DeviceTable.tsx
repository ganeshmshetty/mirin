import {
  AlertCircle,
  Heart,
  MoreVertical,
  Wifi,
  RefreshCw,
  Edit2,
  Play,
} from "lucide-react";
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Device } from "../types";
import logo from "../assets/logo.svg";

import { useTranslation } from "react-i18next";
import { getDeterministicName } from "../utils";


interface DeviceTableProps {
  devices: Device[];
  onRemoveDevice?: (deviceId: string) => void;
  onRenameDevice?: (deviceId: string, newName: string) => void;
  onToggleFavorite: (deviceId: string) => void;
  onSwitchToWireless?: (deviceId: string) => void;
  switchingId?: string | null;
  onConnectClick?: () => void;
}

export function DeviceTable({
  devices,
  onToggleFavorite,
  onConnectClick,
  onSwitchToWireless,
  switchingId,
  onRenameDevice,
}: DeviceTableProps) {


  const { t } = useTranslation();
  const [mirrorStatuses, setMirrorStatuses] = useState<Record<string, string>>({});
  const [activeTransport, setActiveTransport] = useState<Record<string, string>>({});
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const handleMirrorStatus = (e: CustomEvent<{ deviceId: string; status: string }>) => {
      setMirrorStatuses((prev) => ({ ...prev, [e.detail.deviceId]: e.detail.status }));
    };
    window.addEventListener("mirror-status", handleMirrorStatus as EventListener);
    return () => window.removeEventListener("mirror-status", handleMirrorStatus as EventListener);
  }, []);

  useEffect(() => {
    if (!openMenuId) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-dropdown-menu]") && !target.closest("[data-menu-toggle]")) {
        setOpenMenuId(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenuId]);

  // Sort: favorites first, then the rest — maintain stable ordering within each group

  const sorted = [
    ...devices.filter((d) => d.favorite),
    ...devices.filter((d) => !d.favorite),
  ];

  const hasFavorites = devices.some((d) => d.favorite);
  const hasNonFavorites = devices.some((d) => !d.favorite);

  if (devices.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
        <img src={logo} alt="Mirin" className="w-24 h-24 mb-6 object-contain" />
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100 mb-1">
          {t("devices.no_devices")}
        </h3>
        <p className="text-sm text-gray-400 dark:text-slate-500 max-w-xs mx-auto">
          {t("devices.connect_desc")}
        </p>
        <button
          onClick={onConnectClick}
          className="mt-6 px-6 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 transition-all shadow-sm active:scale-95 inline-flex items-center justify-center"
        >
          Pair Manually
        </button>
      </div>
    );
  }

  const renderDevice = (device: Device) => {
    const isConnected = device.status === "Connected";
    const isOffline = device.status === "Offline";
    const isUnauthorized = device.status === "Unauthorized";
    const isFavorite = !!device.favorite;

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
        className={`group relative flex items-center gap-4 py-5 px-5 transition-all border border-gray-200 dark:border-[#222629] rounded-none first:rounded-t-xl last:rounded-b-xl -mb-px last:mb-0 overflow-hidden ${
          isConnected
            ? "bg-cyan-600/[0.12] dark:bg-cyan-600/[0.16] hover:bg-cyan-600/[0.18] dark:hover:bg-cyan-600/[0.22] border-transparent dark:border-transparent z-10"
            : isOffline
            ? "bg-white/60 dark:bg-[#16191b]/60 opacity-60 hover:opacity-80"
            : "bg-white dark:bg-[#16191b] hover:bg-gray-50 dark:hover:bg-[#1d2327]/50"
        }`}
      >
        {/* 1. Icon (Play button) */}
        <button
          type="button"
          onClick={(e) => {
            if (!isConnected) return;
            e.stopPropagation();
            const targetId = activeTransport[device.id] || device.id;
            navigate(`/device/${encodeURIComponent(targetId)}?tab=screen&autoMirror=1`);
          }}
          disabled={!isConnected}
          title={isConnected ? t("devices.actions.quick_mirror_desc") : undefined}
          className={`w-10 h-10 rounded-lg flex items-center justify-center transition-all shrink-0 relative z-10 ${
            isConnected
              ? "bg-cyan-600 hover:bg-cyan-700 dark:bg-cyan-600 dark:hover:bg-cyan-500 text-white shadow-sm hover:scale-105 cursor-pointer"
              : "bg-gray-100 dark:bg-[#1d2327] text-gray-400 dark:text-slate-500 cursor-default opacity-60"
          }`}
        >
          <Play size={18} className={`ml-0.5 ${isConnected ? "text-white fill-white" : "text-gray-400 dark:text-slate-500 fill-current"}`} />
        </button>

        {/* 2. Info */}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium truncate text-gray-900 dark:text-slate-100">
            {getDeterministicName(device.hardware_id || device.id)}
          </h4>
          <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-slate-400 font-medium mt-0.5">
            <span className="capitalize">{t(`devices.status.${device.status.toLowerCase()}`)}</span>
            {(device.name || device.model) && (
              <>
                <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-[#2f353a]" />
                <span className="truncate">{device.name || device.model}</span>
              </>
            )}
          </div>
        </div>


        {/* 3. Status & Actions */}
        <div className="flex items-center gap-2">
          {/* Status pill */}
          {isUnauthorized ? (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium border border-yellow-100 dark:border-yellow-900/50">
              <AlertCircle size={12} />
              {t("devices.status.unauthorized")}
            </span>
          ) : !isOffline && (mirrorStatuses[device.id] === "streaming" ||
            device.connections?.some((c) => mirrorStatuses[c.id] === "streaming")) ? (
            <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-900/50">
              <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
              {t("devices.status.mirroring")}
            </span>
          ) : null}

          {/* Transport toggle or badge for USB/WiFi */}
          {(() => {
            if (device.status !== "Connected") return null;

            const usbConn = device.connections?.find((c) => c.connection_type === "USB");
            const wifiConn = device.connections?.find((c) => c.connection_type === "Wireless");
            const isUsbConnected =
              usbConn?.status === "Connected" ||
              (!device.connections && device.connection_type === "USB");
            const isWifiConnected =
              wifiConn?.status === "Connected" ||
              (!device.connections && device.connection_type === "Wireless");

            const bothConnected = isUsbConnected && isWifiConnected;
            const selectedId = activeTransport[device.id] || device.id;

            if (bothConnected) {
              return (
                <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-[#2a3036] bg-white dark:bg-[#1d2327] relative z-10">
                  <button
                    onClick={(e) => { e.stopPropagation(); if (usbConn) setActiveTransport((p) => ({ ...p, [device.id]: usbConn.id })); }}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${selectedId === (usbConn?.id || device.id) ? "bg-cyan-600 text-white" : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"}`}
                  >USB</button>
                  <div className="w-px bg-gray-200 dark:bg-[#2a3036]" />
                  <button
                    onClick={(e) => { e.stopPropagation(); if (wifiConn) setActiveTransport((p) => ({ ...p, [device.id]: wifiConn.id })); }}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors ${selectedId === (wifiConn?.id || device.id) ? "bg-cyan-600 text-white" : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"}`}
                  >WiFi</button>
                </div>
              );
            }

            if (isUsbConnected) {
              return (
                <div className="rounded-lg bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 px-3 py-1 text-xs font-medium relative z-10">
                  USB
                </div>
              );
            }

            if (isWifiConnected) {
              return (
                <div className="rounded-lg bg-cyan-500/20 text-cyan-700 dark:text-cyan-300 px-3 py-1 text-xs font-medium relative z-10">
                  WiFi
                </div>
              );
            }

            return null;
          })()}


          {/* Like / Favorite button */}

          <button
            data-menu-toggle={`like-${device.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite(device.id);
            }}
            className={`relative z-10 p-2 rounded-lg transition-colors ${
              isFavorite
                ? "text-cyan-600 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
                : "text-gray-300 dark:text-slate-600 hover:text-cyan-600 dark:hover:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
            }`}
            title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          >
            <Heart size={16} className={isFavorite ? "fill-current" : ""} />
          </button>

          {/* Three dots menu toggle */}
          <button
            data-menu-toggle={device.id}
            onClick={(e) => {
              e.stopPropagation();
              const rect = e.currentTarget.getBoundingClientRect();
              setMenuPosition({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
              setOpenMenuId(openMenuId === device.id ? null : device.id);
            }}
            className={`p-2 rounded-lg transition-colors relative z-10 outline-none ${
              openMenuId === device.id
                ? "bg-gray-100 dark:bg-[#1c2023] text-gray-900 dark:text-slate-100"
                : "text-gray-400 dark:text-slate-500 hover:bg-gray-100 dark:hover:bg-[#1d2327] hover:text-gray-600 dark:hover:text-slate-300"
            }`}
            title="More actions"
          >
            <MoreVertical size={18} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100 dark:bg-[#111315]">
      {/* Scrollable Device List */}
      <div className="flex-1 overflow-y-auto p-4 flex flex-col min-h-0">
        <div className="max-w-xl mx-auto w-full flex-1 flex flex-col min-h-0">
          <div className="flex flex-col">
            {/* Favorites section */}
            {hasFavorites && sorted.filter((d) => d.favorite).map(renderDevice)}

            {/* Divider between favorites and rest */}
            {hasFavorites && hasNonFavorites && (
              <div className="flex items-center gap-3 my-3 mx-1">
                <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a3036]" />
                <span className="text-[10px] font-medium text-gray-400 dark:text-slate-500 uppercase tracking-widest">
                  Other devices
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-[#2a3036]" />
              </div>
            )}

            {/* Non-favorites */}
            {sorted.filter((d) => !d.favorite).map(renderDevice)}
          </div>
        </div>
      </div>

      {/* Fixed bottom bar at the end of the window */}
      <div className="flex-shrink-0 -mx-6 py-4 px-6 border-t border-gray-200 dark:border-[#222629] bg-slate-100 dark:bg-[#111315] flex items-center justify-center">
        <button
          onClick={onConnectClick}
          className="px-6 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 transition-all shadow-sm active:scale-95 inline-flex items-center justify-center"
        >
          Pair Manually
        </button>
      </div>

      {/* Context Menu Dropdown */}
      {(() => {
        if (!openMenuId || !menuPosition) return null;
        const activeDevice = devices.find((d) => d.id === openMenuId);
        if (!activeDevice) return null;

        const isUSB =
          activeDevice.connection_type === "USB" ||
          activeDevice.connections?.some((c) => c.connection_type === "USB");
        const hasWireless =
          activeDevice.connection_type === "Wireless" ||
          activeDevice.connections?.some((c) => c.connection_type === "Wireless");
        const canSwitchWireless = activeDevice.status === "Connected" && isUSB && !hasWireless;

        return (
          <div
            data-dropdown-menu
            style={{ top: menuPosition.top, right: menuPosition.right }}
            className="fixed z-50 w-52 bg-white dark:bg-[#16191b] border border-gray-200 dark:border-[#222629] rounded-xl shadow-xl py-1.5 animate-in fade-in zoom-in-95 duration-100"
          >
            {canSwitchWireless && (
              <button
                onClick={() => {
                  onSwitchToWireless?.(activeDevice.id);
                  setOpenMenuId(null);
                }}
                disabled={switchingId === activeDevice.id}
                className="w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1d2327] flex items-center gap-2.5 disabled:opacity-50 transition-colors"
              >
                {switchingId === activeDevice.id ? (
                  <RefreshCw size={14} className="animate-spin text-cyan-600 dark:text-cyan-400" />
                ) : (
                  <Wifi size={14} className="text-cyan-600 dark:text-cyan-400" />
                )}
                {t("devices.actions.switch_wireless")}
              </button>
            )}

            <button
              onClick={() => {
                const newName = window.prompt("Enter new name for device:", activeDevice.name);
                if (newName && newName !== activeDevice.name) {
                  onRenameDevice?.(activeDevice.id, newName);
                }
                setOpenMenuId(null);
              }}
              className="w-full text-left px-3.5 py-2 text-xs font-medium text-gray-700 dark:text-slate-200 hover:bg-gray-50 dark:hover:bg-[#1d2327] flex items-center gap-2.5 transition-colors"
            >
              <Edit2 size={14} className="text-gray-400 dark:text-slate-400" />
              {t("devices.actions.rename")}
            </button>
          </div>
        );
      })()}

    </div>
  );
}




