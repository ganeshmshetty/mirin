import { useEffect } from "react";
import { CheckCircle2, XCircle, AlertTriangle, Info, X } from "lucide-react";

export type ToastType = "success" | "error" | "warning" | "info";

interface ToastProps {
  message: string;
  type: ToastType;
  duration?: number;
  onClose: () => void;
}

const typeConfig: Record<
  ToastType,
  {
    icon: typeof CheckCircle2;
    iconClass: string;
    iconBg: string;
  }
> = {
  success: {
    icon: CheckCircle2,
    iconClass: "text-emerald-600 dark:text-emerald-400",
    iconBg: "bg-emerald-50 dark:bg-emerald-500/10",
  },
  error: {
    icon: XCircle,
    iconClass: "text-red-600 dark:text-red-400",
    iconBg: "bg-red-50 dark:bg-red-500/10",
  },
  warning: {
    icon: AlertTriangle,
    iconClass: "text-amber-600 dark:text-amber-400",
    iconBg: "bg-amber-50 dark:bg-amber-500/10",
  },
  info: {
    icon: Info,
    iconClass: "text-cyan-600 dark:text-cyan-400",
    iconBg: "bg-cyan-50 dark:bg-cyan-500/10",
  },
};

export function Toast({ message, type, duration = 4000, onClose }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);

  const config = typeConfig[type];
  const Icon = config.icon;

  return (
    <div
      role="status"
      className="
        pointer-events-auto flex w-full max-w-[min(22rem,calc(100vw-2rem))]
        items-start gap-3 rounded-2xl
        border border-gray-200/90 dark:border-[#2a3036]
        bg-white/95 dark:bg-[#16191b]/95
        px-3.5 py-3
        shadow-[0_10px_40px_-12px_rgba(0,0,0,0.18)] dark:shadow-[0_10px_40px_-8px_rgba(0,0,0,0.5)]
        backdrop-blur-xl
        animate-slide-up
      "
    >
      <div
        className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-xl ${config.iconBg} ${config.iconClass}`}
      >
        <Icon size={16} strokeWidth={2.25} />
      </div>

      <p className="min-w-0 flex-1 self-center text-[13px] font-medium leading-snug text-gray-800 dark:text-slate-100 break-words whitespace-pre-wrap line-clamp-4">
        {message}
      </p>

      <button
        type="button"
        onClick={onClose}
        className="flex-shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:text-slate-500 dark:hover:bg-[#1d2327] dark:hover:text-slate-300 transition-colors"
        aria-label="Close notification"
      >
        <X size={14} strokeWidth={2.5} />
      </button>
    </div>
  );
}
