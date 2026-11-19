"use client";

import React, { useEffect, useId, useRef } from "react";
import { X } from "lucide-react";

export type ModalSize = "sm" | "md" | "lg" | "xl" | "full";

export interface ModalProps {
  isOpen?: boolean;
  title?: string;
  subtitle?: string;
  onClose: () => void;
  size?: ModalSize;
  children: React.ReactNode;
  footer?: React.ReactNode;
  closeOnBackdrop?: boolean;
  className?: string;
}

/** Pull `data-modal-actions` out of the tree into a real footer (outside scroll). */
function extractModalActions(
  children: React.ReactNode,
  formId: string,
): { body: React.ReactNode; actions: React.ReactNode | null } {
  let actions: React.ReactNode = null;

  const wireSubmitButtons = (node: React.ReactNode): React.ReactNode =>
    React.Children.map(node, (child) => {
      if (!React.isValidElement(child)) return child;
      const props = child.props as Record<string, unknown>;
      if (props.type === "submit") {
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          form: (props.form as string) || formId,
        });
      }
      if (props.children != null) {
        return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
          children: wireSubmitButtons(props.children as React.ReactNode),
        });
      }
      return child;
    });

  const stripActionChrome = (className?: string) => {
    const base = (className || "")
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => !/^(mt-|pt-|pb-|border-t)/.test(c));
    if (!base.some((c) => c.startsWith("flex"))) base.unshift("flex", "items-center", "justify-end", "gap-3");
    if (!base.includes("w-full")) base.push("w-full");
    return base.join(" ");
  };

  const walk = (node: React.ReactNode, parentFormId: string | null): React.ReactNode =>
    React.Children.map(node, (child) => {
      if (!React.isValidElement(child)) return child;
      const props = child.props as Record<string, unknown>;

      if (props["data-modal-actions"] !== undefined) {
        if (actions == null) {
          const { "data-modal-actions": _omit, children: actionKids, className, ...rest } = props;
          actions = React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
            ...rest,
            className: stripActionChrome(className as string | undefined),
            children: parentFormId
              ? wireSubmitButtons(actionKids as React.ReactNode)
              : actionKids,
          });
        }
        return null;
      }

      const isForm = child.type === "form";
      const nextFormId = isForm ? ((props.id as string) || formId) : parentFormId;
      const kids = props.children as React.ReactNode | undefined;
      if (kids == null) {
        return isForm && !props.id
          ? React.cloneElement(child as React.ReactElement<Record<string, unknown>>, { id: formId })
          : child;
      }

      return React.cloneElement(child as React.ReactElement<Record<string, unknown>>, {
        children: walk(kids, nextFormId),
        ...(isForm && !props.id ? { id: formId } : null),
      });
    });

  return { body: walk(children, null), actions };
}

export function Modal({
  isOpen = true,
  title,
  subtitle,
  onClose,
  size = "md",
  children,
  footer,
  closeOnBackdrop = false,
  className = "",
}: ModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  const reactId = useId().replace(/:/g, "");
  const formId = `modal-form-${reactId}`;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Escape only when backdrop-dismiss is opted in (default: X / Cancel only)
      if (e.key === "Escape" && closeOnBackdrop) {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, onClose, closeOnBackdrop]);

  if (!isOpen) return null;

  const sizeClasses = {
    sm: "max-w-md",
    md: "max-w-lg",
    lg: "max-w-2xl",
    xl: "max-w-4xl",
    full: "max-w-5xl",
  }[size];

  const extracted = footer ? null : extractModalActions(children, formId);
  const body = footer ? children : extracted!.body;
  const resolvedFooter = footer ?? extracted!.actions;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0B3D2B]/60 overflow-y-auto"
      onClick={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        ref={modalRef}
        className={`w-full ${sizeClasses} bg-white rounded-xl border border-[#E8E8E5] shadow-lg flex flex-col max-h-[90vh] overflow-hidden dark:bg-[#0C2620] dark:border-[#1B5039] ${className}`}
      >
        {(title || subtitle) && (
          <div className="flex items-start justify-between px-5 py-4 border-b border-[#E8E8E5] shrink-0 dark:border-[#1B5039]">
            <div>
              {title && (
                <h2 className="text-[15px] font-semibold text-[#0B3D2B] dark:text-[#F7F7F5]">
                  {title}
                </h2>
              )}
              {subtitle && (
                <p className="mt-0.5 text-[11px] text-[#737373] dark:text-[#94A3B8]">
                  {subtitle}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1 rounded-md text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] transition-colors dark:text-[#94A3B8] dark:hover:text-[#F7F7F5] dark:hover:bg-[#113A2B]"
              aria-label="Close modal"
            >
              <X size={18} />
            </button>
          </div>
        )}

        <div
          className={
            "p-5 overflow-y-auto min-h-0 " + (resolvedFooter ? "flex-1 " : "")
          }
        >
          {body}
        </div>

        {resolvedFooter && (
          <div
            className={
              footer
                ? "flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#FAFAF8] border-t border-[#E8E8E5] shrink-0 dark:bg-[#071713] dark:border-[#1B5039]"
                : "px-5 py-3.5 bg-[#FAFAF8] border-t border-[#E8E8E5] shrink-0 dark:bg-[#071713] dark:border-[#1B5039]"
            }
          >
            {resolvedFooter}
          </div>
        )}
      </div>
    </div>
  );
}
