import {
  useState,
  useCallback,
  createContext,
  useContext,
  ReactNode,
  useRef,
  useEffect,
} from "react";

interface InputDialogOptions {
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmText?: string;
  cancelText?: string;
}

interface InputDialogContextType {
  prompt: (options: InputDialogOptions) => Promise<string | null>;
}

const InputDialogContext = createContext<InputDialogContextType | null>(null);

export function useInputDialog() {
  const context = useContext(InputDialogContext);
  if (!context) {
    throw new Error("useInputDialog must be used within a InputDialogProvider");
  }
  return context;
}

interface InputDialogProviderProps {
  children: ReactNode;
}

interface DialogState extends InputDialogOptions {
  isOpen: boolean;
  resolve: ((value: string | null) => void) | null;
}

export function InputDialogProvider({ children }: InputDialogProviderProps) {
  const [dialogState, setDialogState] = useState<DialogState>({
    isOpen: false,
    title: "",
    message: "",
    defaultValue: "",
    placeholder: "",
    confirmText: "Save",
    cancelText: "Cancel",
    resolve: null,
  });

  const [inputValue, setInputValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const prompt = useCallback(
    (options: InputDialogOptions): Promise<string | null> => {
      return new Promise((resolve) => {
        setInputValue(options.defaultValue || "");
        setDialogState({
          isOpen: true,
          ...options,
          confirmText: options.confirmText || "Save",
          cancelText: options.cancelText || "Cancel",
          resolve,
        });
      });
    },
    [],
  );

  // Focus input on open
  useEffect(() => {
    if (dialogState.isOpen) {
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [dialogState.isOpen]);

  const handleConfirm = useCallback(() => {
    dialogState.resolve?.(inputValue);
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [dialogState.resolve, inputValue]);

  const handleCancel = useCallback(() => {
    dialogState.resolve?.(null);
    setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
  }, [dialogState.resolve]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleConfirm();
      } else if (e.key === "Escape") {
        handleCancel();
      }
    },
    [handleConfirm, handleCancel],
  );

  return (
    <InputDialogContext.Provider value={{ prompt }}>
      {children}
      {dialogState.isOpen && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
            onClick={handleCancel}
          />

          {/* Dialog */}
          <div className="relative bg-white rounded-xl shadow-2xl max-w-sm w-full animate-scale-in overflow-hidden">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                {dialogState.title}
              </h3>
              {dialogState.message && (
                <p className="text-sm text-gray-600 mb-4">
                  {dialogState.message}
                </p>
              )}
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={dialogState.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500"
              />
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-gray-50 flex gap-3 justify-end">
              <button
                onClick={handleCancel}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors"
              >
                {dialogState.cancelText}
              </button>
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-cyan-600 rounded-lg hover:bg-cyan-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-cyan-500 transition-colors"
              >
                {dialogState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </InputDialogContext.Provider>
  );
}
