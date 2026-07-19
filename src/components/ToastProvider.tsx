import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useMemo,
} from "react";
import { Toast, ToastType } from "./Toast";

interface ToastMessage {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextType {
  showToast: (message: string, type: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

/** Cap toast body length so UI never balloons from long backend messages. */
function clipMessage(message: string, max = 220): string {
  const trimmed = message.trim();
  if (trimmed.length <= max) return trimmed;
  return trimmed.slice(0, max - 1).trimEnd() + "…";
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const showToast = useCallback((message: string, type: ToastType) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => {
      // Keep at most 3 visible; drop oldest
      const next = [...prev, { id, message: clipMessage(message), type }];
      return next.length > 3 ? next.slice(-3) : next;
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const success = useCallback(
    (message: string) => showToast(message, "success"),
    [showToast],
  );
  const error = useCallback(
    (message: string) => showToast(message, "error"),
    [showToast],
  );
  const warning = useCallback(
    (message: string) => showToast(message, "warning"),
    [showToast],
  );
  const info = useCallback(
    (message: string) => showToast(message, "info"),
    [showToast],
  );

  const memoizedValue = useMemo(
    () => ({ showToast, success, error, warning, info }),
    [showToast, success, error, warning, info],
  );

  return (
    <ToastContext.Provider value={memoizedValue}>
      {children}

      {/* Bottom-center stack — stays inside viewport on narrow windows */}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-[100] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-5"
        aria-live="polite"
        aria-relevant="additions"
      >
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            duration={toast.type === "error" ? 5500 : 3800}
            onClose={() => removeToast(toast.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}
