import {
  AlertCircle,
  Trash2,
  MoreVertical,
  Edit2,
  Plus,
  Smartphone,
  Zap,
  Wifi,
  RefreshCw,
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import type { Device } from "../types";
import { useInputDialog } from "./InputDialog";
import { MirrorButton } from "./MirrorButton";
import logo from "../assets/logo.svg";
import { useTranslation } from "react-i18next";

interface DeviceTableProps {
  devices: Device[];
  onRemoveDevice: (deviceId: string) => void;
  onRenameDevice: (deviceId: string, newName: string) => void;
  onSwitchToWireless?: (deviceId: string) => void;
  switchingId?: string | null;
  onConnectClick?: () => void;
  onQuickMirrorClick?: () => void;
}

export function DeviceTable({
  devices,
  onRemoveDevice,
  onRenameDevice,
  onSwitchToWireless,
  switchingId,
  onConnectClick,
  onQuickMirrorClick,
}: DeviceTableProps) {
  const { t } = useTranslation();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<{
    top: number;
    right: number;
  } | null>(null);
  const [mirrorStatuses, setMirrorStatuses] = useState<Record<string, string>>(
    {},
  );
  const [activeTransport, setActiveTransport] = useState<
    Record<string, string>
  >({});
  const menuRef = useRef<HTMLDivElement>(null);
  const { prompt } = useInputDialog();
  const navigate = useNavigate();

  useEffect(() => {
    const handleMirrorStatus = (
      e: CustomEvent<{ deviceId: string; status: string }>,
    ) => {
      setMirrorStatuses((prev) => ({
        ...prev,
        [e.detail.deviceId]: e.detail.status,
      }));
    };
    window.addEventListener(
      "mirror-status",
      handleMirrorStatus as EventListener,
    );
    return () =>
      window.removeEventListener(
        "mirror-status",
        handleMirrorStatus as EventListener,
      );
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (target.closest("[data-menu-toggle]")) return;

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

  const activeDevice = devices.find((d) => d.id === openMenuId);

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
          className="mt-6 px-6 py-2.5 bg-cyan-600 text-white rounded-xl text-sm font-semibold hover:bg-cyan-700 transition-all shadow-sm active:scale-95 inline-flex items-center gap-2"
        >
          <Plus size={16} />
          {t("devices.connect_device")}
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
                onClick={() =>
                  navigate(
                    `/device/${encodeURIComponent(device.id)}?tab=screen`,
                  )
                }
                onKeyDown={(event) => {
                  if (
                    event.target === event.currentTarget &&
                    event.key === "Enter"
                  ) {
                    navigate(
                      `/device/${encodeURIComponent(device.id)}?tab=screen`,
                    );
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
                    <span>
                      {t(`devices.status.${device.status.toLowerCase()}`)}
                    </span>
                    {(() => {
                      const types = (device.connections || [])
                        .filter((c) => c.status === "Connected")
                        .map((c) => c.connection_type);
                      const uniqueTypes = [
                        ...new Set(
                          types.length
                            ? types
                            : device.connection_type
                              ? [device.connection_type]
                              : [],
                        ),
                      ].map((type) =>
                        t(`devices.connection.${type.toLowerCase()}`),
                      );
                      if (uniqueTypes.length > 0) {
                        return (
                          <>
                            <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-[#2f353a]" />
                            <span
                              className={
                                uniqueTypes.length === 1
                                  ? "uppercase"
                                  : undefined
                              }
                            >
                              {uniqueTypes.join(" + ")}
                            </span>
                          </>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>

                {/* 3. Status & Actions */}
                <div className="flex items-center gap-3">
                  {/* Connection Status Pill */}
                  {isUnauthorized ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-yellow-50 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-medium border border-yellow-100 dark:border-yellow-900/50">
                      <AlertCircle size={12} />
                      {t("devices.status.unauthorized")}
                    </span>
                  ) : isOffline ? (
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#1c2023] text-gray-500 dark:text-slate-300 text-xs font-medium border border-transparent dark:border-[#222629]">
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-400 dark:bg-slate-500" />
                      {t("devices.status.offline")}
                    </span>
                  ) : (
                    <div className="hidden sm:flex items-center gap-3 pr-2">
                      {(mirrorStatuses[device.id] === "streaming" ||
                        device.connections?.some(
                          (connection) =>
                            mirrorStatuses[connection.id] === "streaming",
                        )) && (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs font-medium border border-blue-100 dark:border-blue-900/50">
                          <div className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          {t("devices.status.mirroring")}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Transport toggle for merged entries (USB + Wireless) */}
                  {(() => {
                    const usbConn = device.connections?.find(
                      (c) => c.connection_type === "USB",
                    );
                    const wifiConn = device.connections?.find(
                      (c) => c.connection_type === "Wireless",
                    );
                    const bothConnected =
                      device.status === "Connected" &&
                      usbConn?.status === "Connected" &&
                      wifiConn?.status === "Connected";
                    const selectedId = activeTransport[device.id] || device.id;

                    if (bothConnected) {
                      const setUsb = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setActiveTransport((prev) => ({
                          ...prev,
                          [device.id]: usbConn!.id,
                        }));
                      };
                      const setWifi = (e: React.MouseEvent) => {
                        e.stopPropagation();
                        setActiveTransport((prev) => ({
                          ...prev,
                          [device.id]: wifiConn!.id,
                        }));
                      };
                      return (
                        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-[#2a3036] bg-white dark:bg-[#1d2327] relative z-10">
                          <button
                            onClick={setUsb}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              selectedId === usbConn!.id
                                ? "bg-cyan-500 text-white"
                                : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"
                            }`}
                          >
                            USB
                          </button>
                          <div className="w-px bg-gray-200 dark:bg-[#2a3036]" />
                          <button
                            onClick={setWifi}
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              selectedId === wifiConn!.id
                                ? "bg-cyan-500 text-white"
                                : "text-gray-500 dark:text-slate-400 hover:bg-gray-100 dark:hover:bg-[#252c31]"
                            }`}
                          >
                            WiFi
                          </button>
                        </div>
                      );
                    }
                    return null;
                  })()}

                  {/* Switch to Wireless (USB-only devices, not already wireless) */}
                  {device.status === "Connected" &&
                    device.connection_type === "USB" &&
                    !device.connections?.some(
                      (c) => c.connection_type === "Wireless",
                    ) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSwitchToWireless?.(device.id);
                        }}
                        disabled={switchingId === device.id}
                        className="relative z-10 px-2.5 py-1.5 text-xs font-medium text-cyan-700 dark:text-cyan-400 bg-cyan-50 dark:bg-cyan-900/30 hover:bg-cyan-100 dark:hover:bg-cyan-900/50 rounded-lg transition-colors border border-cyan-200 dark:border-cyan-800 disabled:opacity-50 flex items-center gap-1.5"
                        title={t("devices.actions.switch_wireless_title")}
                      >
                        {switchingId === device.id ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : (
                          <Wifi size={12} />
                        )}
                        {t("devices.connection.wireless")}
                      </button>
                    )}

                  {/* Mirror Action (uses the selected transport) */}
                  {device.status === "Connected" && (
                    <MirrorButton
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        const targetId =
                          activeTransport[device.id] || device.id;
                        navigate(
                          `/device/${encodeURIComponent(targetId)}?tab=screen&autoMirror=1`,
                        );
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
                        right: window.innerWidth - rect.right,
                      });
                      setOpenMenuId(isMenuOpen ? null : device.id);
                    }}
                    className={`p-2 rounded-lg transition-colors relative z-10 outline-none ${
                      isMenuOpen
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
            <div className="flex-1 flex items-center justify-center min-h-0">
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
            position: "fixed",
            top: menuPosition.top,
            right: menuPosition.right,
            zIndex: 9999,
          }}
          className="w-40 dropdown-menu animate-scale-in origin-top-right"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Transport-specific mirror for merged entries */}
          {(() => {
            const usbConn = activeDevice.connections?.find(
              (c) => c.connection_type === "USB",
            );
            const wifiConn = activeDevice.connections?.find(
              (c) => c.connection_type === "Wireless",
            );
            if (
              activeDevice.status === "Connected" &&
              usbConn?.status === "Connected" &&
              wifiConn?.status === "Connected"
            ) {
              return (
                <>
                  <button
                    onClick={() => {
                      setActiveTransport((prev) => ({
                        ...prev,
                        [activeDevice.id]: usbConn!.id,
                      }));
                      navigate(
                        `/device/${encodeURIComponent(usbConn!.id)}?tab=screen&autoMirror=1`,
                      );
                      setOpenMenuId(null);
                    }}
                    className="dropdown-item"
                  >
                    <Smartphone
                      size={14}
                      className="text-gray-400 dark:text-slate-400"
                    />
                    Mirror via USB
                  </button>
                  <button
                    onClick={() => {
                      setActiveTransport((prev) => ({
                        ...prev,
                        [activeDevice.id]: wifiConn!.id,
                      }));
                      navigate(
                        `/device/${encodeURIComponent(wifiConn!.id)}?tab=screen&autoMirror=1`,
                      );
                      setOpenMenuId(null);
                    }}
                    className="dropdown-item"
                  >
                    <Wifi
                      size={14}
                      className="text-gray-400 dark:text-slate-400"
                    />
                    Mirror via WiFi
                  </button>
                </>
              );
            }
            return null;
          })()}

          {activeDevice.status === "Connected" &&
            activeDevice.connection_type === "USB" &&
            !activeDevice.connections?.some(
              (c) => c.connection_type === "Wireless",
            ) && (
              <button
                onClick={() => {
                  onSwitchToWireless?.(activeDevice.id);
                  setOpenMenuId(null);
                }}
                disabled={switchingId === activeDevice.id}
                className="dropdown-item"
              >
                {switchingId === activeDevice.id ? (
                  <RefreshCw
                    size={14}
                    className="animate-spin text-gray-400 dark:text-slate-400"
                  />
                ) : (
                  <Wifi
                    size={14}
                    className="text-gray-400 dark:text-slate-400"
                  />
                )}
                {t("devices.actions.switch_wireless")}
              </button>
            )}
          <button
            onClick={async () => {
              const newName = await prompt({
                title: t("devices.actions.rename_device"),
                defaultValue: activeDevice.name,
                confirmText: t("devices.actions.rename"),
                placeholder: t("devices.actions.enter_new_name"),
              });
              if (newName && newName !== activeDevice.name) {
                onRenameDevice(activeDevice.id, newName);
              }
              setOpenMenuId(null);
            }}
            className="dropdown-item"
          >
            <Edit2 size={14} className="text-gray-400 dark:text-slate-400" />
            {t("devices.actions.rename")}
          </button>
          <button
            onClick={() => {
              onRemoveDevice(activeDevice.id);
              setOpenMenuId(null);
            }}
            className="dropdown-item-danger"
          >
            <Trash2 size={14} />
            {t("devices.actions.forget")}
          </button>
        </div>
      )}
    </div>
  );
}
