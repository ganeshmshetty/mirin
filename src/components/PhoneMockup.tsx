import React from "react";
import { WifiOff } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PhoneMockupProps {
  status?: string;
  deviceName?: string;
}

export const PhoneMockup: React.FC<PhoneMockupProps> = ({
  status = "Connected",
  deviceName = "Android Device",
}) => {
  const { t } = useTranslation();
  const isOffline = status.toLowerCase() === "offline" || status.toLowerCase() === "disconnected";

  return (
    <div className="relative select-none flex-shrink-0 animate-fade-in" title={`${deviceName} (${status})`}>
      {/* Outer Phone Bezel & Frame (Clean slate neutral instead of full black) */}
      <div
        className={`w-32 h-64 rounded-[28px] border-[5px] border-slate-700 dark:border-[#2a3038] bg-slate-800 dark:bg-[#1c2128] relative overflow-hidden flex flex-col items-center justify-between ${
          isOffline ? "opacity-80 grayscale-[25%]" : ""
        }`}
      >
        {/* Speaker / Camera Notch */}
        <div className="absolute top-2 w-9 h-1.5 bg-slate-700 dark:bg-[#2f3640] rounded-full z-20" />

        {/* Soft Neutral Screen Area without Android icon/text and without being pitch black */}
        <div className="absolute inset-0 w-full h-full bg-slate-100 dark:bg-[#15191f] overflow-hidden flex flex-col items-center justify-center p-3">
          {/* Offline / Disconnected Screen Overlay */}
          {isOffline && (
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-[1.5px] flex flex-col items-center justify-center p-2 z-20 text-center">
              <WifiOff size={20} className="text-slate-300 mb-1" />
              <span className="text-[10px] font-semibold text-slate-200 uppercase tracking-wide">
                {t("devices.status.offline")}
              </span>
            </div>
          )}
        </div>

        {/* Bottom Home Indicator Bar */}
        <div className="absolute bottom-1.5 w-10 h-0.5 bg-slate-400 dark:bg-slate-600 rounded-full z-20" />
      </div>
    </div>
  );
};
