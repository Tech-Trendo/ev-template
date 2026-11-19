"use client";

import React, { forwardRef } from "react";
import { Loader2 } from "lucide-react";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      variant = "primary",
      size = "md",
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      className = "",
      type = "button",
      ...props
    },
    ref
  ) => {
    const isDisabled = disabled || loading;
    const iconOnly = children == null || children === false;

    // Base styling: solid colors, visible focus rings, Poppins typography, no gradients
    const baseClasses =
      "inline-flex items-center justify-center font-medium transition-colors select-none rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed";

    const sizeClasses = iconOnly
      ? { sm: "h-8 w-8 shrink-0 p-0", md: "h-9 w-9 shrink-0 p-0", lg: "h-11 w-11 shrink-0 p-0" }[size]
      : { sm: "h-8 px-2.5 text-[11px] gap-1.5", md: "h-9 px-3.5 text-[12px] gap-2", lg: "h-11 px-5 text-[14px] gap-2.5" }[size];

    const variantClasses = {
      primary:
        "bg-[#0B3D2B] text-white hover:bg-[#082E20] active:bg-[#06241A] border border-transparent dark:bg-[#14503B] dark:hover:bg-[#083754]",
      secondary:
        "bg-white text-[#0B3D2B] border border-[#E8E8E5] hover:bg-[#FAFAF8] hover:border-[#D4D4CE] active:bg-[#F0F0ED] dark:bg-[#0C2620] dark:text-[#F7F7F5] dark:border-[#1B5039] dark:hover:bg-[#113A2B]",
      danger:
        "bg-[#DC2626] text-white hover:bg-[#B91C1C] active:bg-[#991B1B] border border-transparent",
      ghost:
        "bg-transparent text-[#737373] hover:text-[#0B3D2B] hover:bg-[#F0F0ED] active:bg-[#E8E8E5] border border-transparent dark:text-[#94A3B8] dark:hover:text-[#F7F7F5] dark:hover:bg-[#113A2B]",
    }[variant];

    const widthClasses = fullWidth ? "w-full" : "";

    return (
      <button
        ref={ref}
        type={type}
        disabled={isDisabled}
        className={`${baseClasses} ${sizeClasses} ${variantClasses} ${widthClasses} ${className}`}
        {...props}
      >
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
        ) : (
          leftIcon
        )}
        {!iconOnly &&
          (typeof children === "string" || typeof children === "number" ? (
            <span className="whitespace-nowrap">{children}</span>
          ) : (
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{children}</span>
          ))}
        {!loading && rightIcon}
      </button>
    );
  }
);

Button.displayName = "Button";
