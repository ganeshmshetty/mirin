import { useState, useCallback, createContext, useContext, ReactNode } from "react";

interface ConfirmDialogOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
    variant?: "danger" | "warning" | "info";
    hideCancel?: boolean;
}

interface ConfirmDialogContextType {
    confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
}

const ConfirmDialogContext = createContext<ConfirmDialogContextType | null>(null);

export function useConfirmDialog() {
    const context = useContext(ConfirmDialogContext);
    if (!context) {
        throw new Error("useConfirmDialog must be used within a ConfirmDialogProvider");
    }
    return context;
}

interface ConfirmDialogProviderProps {
    children: ReactNode;
}

interface DialogState extends ConfirmDialogOptions {
    isOpen: boolean;
    resolve: ((value: boolean) => void) | null;
}

export function ConfirmDialogProvider({ children }: ConfirmDialogProviderProps) {
    const [dialogState, setDialogState] = useState<DialogState>({
        isOpen: false,
        title: "",
        message: "",
        confirmText: "Confirm",
        cancelText: "Cancel",
        variant: "danger",
        hideCancel: false,
        resolve: null,
    });

    const confirm = useCallback((options: ConfirmDialogOptions): Promise<boolean> => {
        return new Promise((resolve) => {
            setDialogState({
                isOpen: true,
                ...options,
                confirmText: options.confirmText || "Confirm",
                cancelText: options.cancelText || "Cancel",
                variant: options.variant || "danger",
                hideCancel: options.hideCancel || false,
                resolve,
            });
        });
    }, []);

    const handleConfirm = useCallback(() => {
        dialogState.resolve?.(true);
        setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
    }, [dialogState.resolve]);

    const handleCancel = useCallback(() => {
        dialogState.resolve?.(false);
        setDialogState((prev) => ({ ...prev, isOpen: false, resolve: null }));
    }, [dialogState.resolve]);

    const variantStyles = {
        danger: {
            icon: (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
            ),
            iconBg: "bg-red-100",
            confirmBtn: "bg-red-600 hover:bg-red-700 focus:ring-red-500",
        },
        warning: {
            icon: (
                <svg className="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            iconBg: "bg-yellow-100",
            confirmBtn: "bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500",
        },
        info: {
            icon: (
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
            ),
            iconBg: "bg-blue-100",
            confirmBtn: "bg-blue-600 hover:bg-blue-700 focus:ring-blue-500",
        },
    };

    const currentVariant = variantStyles[dialogState.variant || "danger"];

    return (
        <ConfirmDialogContext.Provider value={{ confirm }}>
            {children}

            {/* Confirmation Dialog */}
            {dialogState.isOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <div
                        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
                        onClick={handleCancel}
                    />

                    {/* Dialog */}
                    <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full animate-scale-in overflow-hidden">
                        <div className="p-6">
                            <div className="flex items-start gap-4">
                                {/* Icon */}
                                <div className={`flex-shrink-0 w-12 h-12 rounded-full ${currentVariant.iconBg} flex items-center justify-center`}>
                                    {currentVariant.icon}
                                </div>

                                {/* Content */}
                                <div className="flex-1 pt-1">
                                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                        {dialogState.title}
                                    </h3>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        {dialogState.message}
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Actions */}
                        <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 p-6 border-t border-gray-200 dark:border-[#2a3036] bg-gray-50 dark:bg-[#16191b] rounded-b-2xl">
                            {!dialogState.hideCancel && (
                                <button
                                    onClick={handleCancel}
                                    className="px-5 py-2.5 rounded-xl font-medium text-gray-700 dark:text-slate-300 bg-white dark:bg-[#1d2327] hover:bg-gray-50 dark:hover:bg-[#252b30] border border-gray-200 dark:border-[#2a3036] transition-colors focus:outline-none focus:ring-2 focus:ring-gray-200 dark:focus:ring-gray-700 shadow-sm"
                                >
                                    {dialogState.cancelText}
                                </button>
                            )}
                            <button
                                onClick={handleConfirm}
                                className={`px-5 py-2.5 rounded-xl font-medium text-white shadow-sm transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 dark:focus:ring-offset-[#16191b] ${currentVariant.confirmBtn}`}
                            >
                                {dialogState.confirmText}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ConfirmDialogContext.Provider>
    );
}
