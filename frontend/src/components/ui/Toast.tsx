"use client";

import React, { createContext, useContext, useState, useCallback, useId } from "react";
import { CheckCircle2, AlertCircle, Info, AlertTriangle, X } from "lucide-react";

export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastItem {
  id: string;
  type: ToastType;
  message: string;
  duration?: number;
}

interface ToastContextValue {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", duration = 4000) => {
      const id = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, message, duration }]);

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (message: string) => showToast(message, "success"),
    [showToast]
  );
  const error = useCallback(
    (message: string) => showToast(message, "error"),
    [showToast]
  );
  const info = useCallback(
    (message: string) => showToast(message, "info"),
    [showToast]
  );
  const warning = useCallback(
    (message: string) => showToast(message, "warning"),
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, info, warning }}>
      {children}
      {/* Toast container */}
      <div
        className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none"
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex items-start gap-2.5 p-3 rounded-lg border shadow-md text-[12px] font-medium transition-all ${
              t.type === "success"
                ? "bg-[#F0FDF4] border-[#BBF7D0] text-[#166534] dark:bg-[#062814] dark:border-[#166534] dark:text-[#4ADE80]"
                : t.type === "error"
                ? "bg-[#FEF2F2] border-[#FECACA] text-[#991B1B] dark:bg-[#320B0B] dark:border-[#991B1B] dark:text-[#F87171]"
                : t.type === "warning"
                ? "bg-[#FFFBEB] border-[#FDE68A] text-[#92400E] dark:bg-[#2C1D06] dark:border-[#92400E] dark:text-[#FBBF24]"
                : "bg-[#EFF6FF] border-[#BFDBFE] text-[#1E40AF] dark:bg-[#082046] dark:border-[#1E40AF] dark:text-[#60A5FA]"
            }`}
          >
            <div className="shrink-0 mt-0.5">
              {t.type === "success" && <CheckCircle2 size={16} />}
              {t.type === "error" && <AlertCircle size={16} />}
              {t.type === "warning" && <AlertTriangle size={16} />}
              {t.type === "info" && <Info size={16} />}
            </div>
            <div className="flex-1 leading-snug">{t.message}</div>
            <button
              type="button"
              onClick={() => removeToast(t.id)}
              className="shrink-0 p-0.5 opacity-70 hover:opacity-100 transition-opacity"
              aria-label="Dismiss toast"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
