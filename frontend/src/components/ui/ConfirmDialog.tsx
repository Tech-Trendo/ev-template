"use client";

import React, { useEffect, useRef } from "react";
import { AlertTriangle, ShieldAlert } from "lucide-react";
import { Button } from "./Button";

export interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  isOpen,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    // Focus starts on the safe option per rules
    const timer = setTimeout(() => {
      cancelBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onCancel, loading]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B3D2B]/60"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      aria-describedby="confirm-dialog-desc"
    >
      <div className="w-full max-w-md bg-white rounded-xl border border-[#E8E8E5] shadow-lg p-5 dark:bg-[#0C2620] dark:border-[#1B5039]">
        <div className="flex items-start gap-3.5">
          <div
            className={`p-2 rounded-lg shrink-0 ${
              variant === "danger"
                ? "bg-[#FEF2F2] text-[#DC2626] dark:bg-[#320B0B]"
                : "bg-[#FFFBEB] text-[#D97706] dark:bg-[#2C1D06]"
            }`}
          >
            {variant === "danger" ? <ShieldAlert size={20} /> : <AlertTriangle size={20} />}
          </div>
          <div className="flex-1">
            <h3
              id="confirm-dialog-title"
              className="text-[14px] font-semibold text-[#0B3D2B] dark:text-[#F7F7F5]"
            >
              {title}
            </h3>
            <p
              id="confirm-dialog-desc"
              className="mt-1.5 text-[12px] text-[#737373] dark:text-[#94A3B8] leading-relaxed"
            >
              {description}
            </p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2.5">
          <Button
            ref={cancelBtnRef}
            variant="secondary"
            size="md"
            onClick={onCancel}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={variant === "danger" ? "danger" : "primary"}
            size="md"
            loading={loading}
            onClick={onConfirm}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
