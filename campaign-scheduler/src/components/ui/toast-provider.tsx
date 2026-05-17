"use client";

import {
    createContext,
    useContext,
    useState,
    useCallback,
    useEffect,
    type ReactNode,
} from "react";
import { CheckCircle, XCircle, Info, X } from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────
type ToastType = "success" | "error" | "info";

interface Toast {
    id: string;
    type: ToastType;
    message: string;
    description?: string;
    exiting?: boolean;
}

interface ToastOptions {
    description?: string;
}

interface ToastContextValue {
    success: (message: string, options?: ToastOptions) => void;
    error: (message: string, options?: ToastOptions) => void;
    info: (message: string, options?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const ctx = useContext(ToastContext);
    if (!ctx) throw new Error("useToast must be used within ToastProvider");
    return ctx;
}

// Also export a non-hook `toast` object for easy migration from sonner
// This requires the provider to be mounted — uses module-level ref
let _toastRef: ToastContextValue | null = null;

export const toast = {
    success: (msg: string, opts?: ToastOptions) => _toastRef?.success(msg, opts),
    error: (msg: string, opts?: ToastOptions) => _toastRef?.error(msg, opts),
    info: (msg: string, opts?: ToastOptions) => _toastRef?.info(msg, opts),
};

// ── Config ────────────────────────────────────────────────────────────
const TOAST_CONFIG: Record<ToastType, { border: string; Icon: typeof CheckCircle }> = {
    success: { border: "#16a34a", Icon: CheckCircle },
    error: { border: "#ef4444", Icon: X },
    info: { border: "#F59E0B", Icon: Info },
};

const AUTO_DISMISS_MS = 4000;

// ── Provider ──────────────────────────────────────────────────────────
export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((type: ToastType, message: string, description?: string) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        setToasts((prev) => [...prev, { id, type, message, description }]);

        // Auto-dismiss
        setTimeout(() => {
            setToasts((prev) =>
                prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
            );
            setTimeout(() => {
                setToasts((prev) => prev.filter((t) => t.id !== id));
            }, 300);
        }, AUTO_DISMISS_MS);
    }, []);

    const dismiss = useCallback((id: string) => {
        setToasts((prev) =>
            prev.map((t) => (t.id === id ? { ...t, exiting: true } : t))
        );
        setTimeout(() => {
            setToasts((prev) => prev.filter((t) => t.id !== id));
        }, 300);
    }, []);

    const value: ToastContextValue = {
        success: useCallback((msg: string, opts?: ToastOptions) => addToast("success", msg, opts?.description), [addToast]),
        error: useCallback((msg: string, opts?: ToastOptions) => addToast("error", msg, opts?.description), [addToast]),
        info: useCallback((msg: string, opts?: ToastOptions) => addToast("info", msg, opts?.description), [addToast]),
    };

    // Sync module-level ref so `toast.success(...)` works without hook
    useEffect(() => {
        _toastRef = value;
        return () => { _toastRef = null; };
    }, [value]);

    return (
        <ToastContext.Provider value={value}>
            {children}

            {/* Toast container — top-right, stacked */}
            <div
                className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none"
                style={{ maxWidth: 380 }}
            >
                {toasts.map((t) => {
                    const cfg = TOAST_CONFIG[t.type];
                    return (
                        <div
                            key={t.id}
                            className="pointer-events-auto flex items-start gap-3 px-4 py-3 rounded-lg shadow-xl"
                            style={{
                                backgroundColor: "#141414",
                                borderLeft: `3px solid ${cfg.border}`,
                                border: `1px solid #222`,
                                borderLeftWidth: 3,
                                borderLeftColor: cfg.border,
                                animation: t.exiting
                                    ? "toast-exit 0.3s ease-in forwards"
                                    : "toast-enter 0.3s ease-out forwards",
                            }}
                        >
                            <cfg.Icon
                                className="w-4 h-4 shrink-0 mt-0.5"
                                style={{ color: cfg.border }}
                            />
                            <div className="flex-1">
                                <p className="text-[13px] text-white font-medium">{t.message}</p>
                                {t.description && (
                                    <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">{t.description}</p>
                                )}
                            </div>
                            <button
                                onClick={() => dismiss(t.id)}
                                className="shrink-0 mt-0.5 transition-colors"
                                style={{ color: "#555" }}
                                onMouseEnter={(e) => (e.currentTarget.style.color = "#999")}
                                onMouseLeave={(e) => (e.currentTarget.style.color = "#555")}
                            >
                                <X className="w-3.5 h-3.5" />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Keyframe styles */}
            <style jsx global>{`
                @keyframes toast-enter {
                    from {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(0);
                    }
                }
                @keyframes toast-exit {
                    from {
                        opacity: 1;
                        transform: translateX(0);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(100%);
                    }
                }
            `}</style>
        </ToastContext.Provider>
    );
}
