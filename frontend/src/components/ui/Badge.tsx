"use client";

import React from "react";

export type BadgeVariant = "neutral" | "success" | "warning" | "danger" | "info";
export type BadgeSize = "sm" | "md";

const STATUS_TO_VARIANT: Record<string, BadgeVariant> = {
  new: "info",
  contacted: "info",
  scheduled: "info",
  sent: "info",
  viewed: "info",
  in_transit: "info",
  received: "info",
  in_progress: "info",
  waiting_for_parts: "warning",
  on_hold: "warning",
  reserved: "warning",
  pdi_pending: "warning",
  probation: "warning",
  active: "success",
  converted: "success",
  won: "success",
  completed: "success",
  accepted: "success",
  ready_for_sale: "success",
  pdi_passed: "success",
  delivered: "success",
  sold: "success",
  rejected: "danger",
  expired: "danger",
  lost: "danger",
  cancelled: "danger",
  scrapped: "danger",
  failed: "danger",
  terminated: "danger",
  inactive: "neutral",
  resigned: "neutral",
  locked: "neutral",
  draft: "neutral",
};

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  status?: string;
  size?: BadgeSize;
  dot?: boolean;
  children?: React.ReactNode;
}

export function Badge({
  variant,
  status,
  size = "md",
  dot = false,
  children,
  className = "",
  ...props
}: BadgeProps) {
  const normStatus = (status || "").toLowerCase();
  const effectiveVariant: BadgeVariant =
    variant ?? (status ? STATUS_TO_VARIANT[normStatus] ?? "neutral" : "neutral");

  const effectiveChildren =
    children ?? (status ? status.replace(/_/g, " ") : "");

  const sizeClasses = {
    sm: "px-2 py-0.5 text-[10px]",
    md: "px-2.5 py-1 text-[11px]",
  }[size];

  const variantClasses = {
    neutral:
      "bg-[#F7F7F5] text-[#525252] border border-[#E8E8E5] dark:bg-[#113A2B] dark:text-[#94A3B8] dark:border-[#1B5039]",
    success:
      "bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] dark:bg-[#062814] dark:text-[#4ADE80] dark:border-[#166534]",
    warning:
      "bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A] dark:bg-[#2C1D06] dark:text-[#FBBF24] dark:border-[#92400E]",
    danger:
      "bg-[#FEF2F2] text-[#991B1B] border border-[#FECACA] dark:bg-[#320B0B] dark:text-[#F87171] dark:border-[#991B1B]",
    info:
      "bg-[#EFF6FF] text-[#1E40AF] border border-[#BFDBFE] dark:bg-[#082046] dark:text-[#60A5FA] dark:border-[#1E40AF]",
  }[effectiveVariant];

  const dotClasses = {
    neutral: "bg-[#737373]",
    success: "bg-[#16A34A]",
    warning: "bg-[#D97706]",
    danger: "bg-[#DC2626]",
    info: "bg-[#2563EB]",
  }[effectiveVariant];

  return (
    <span
      className={`inline-flex items-center gap-1.5 font-semibold rounded-full select-none tracking-[0.02em] ${sizeClasses} ${variantClasses} ${className}`}
      {...props}
    >
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${dotClasses}`} aria-hidden="true" />}
      <span>{effectiveChildren}</span>
    </span>
  );
}

export const StatusPill = Badge;
