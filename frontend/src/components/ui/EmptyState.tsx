"use client";

import React from "react";
import { FolderOpen } from "lucide-react";

export interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({
  icon = <FolderOpen size={32} className="text-[#A3A39E] dark:text-[#64748B]" />,
  title,
  description,
  action,
  className = "",
}: EmptyStateProps) {
  return (
    <div
      className={`flex flex-col items-center justify-center p-8 text-center bg-white rounded-xl border border-[#E8E8E5] dark:bg-[#0B2538] dark:border-[#174261] ${className}`}
    >
      <div className="mb-3 flex items-center justify-center">{icon}</div>
      <h3 className="text-[13px] font-semibold text-[#04314A] dark:text-[#F7F7F5]">{title}</h3>
      {description && (
        <p className="mt-1 text-[11px] text-[#737373] dark:text-[#94A3B8] max-w-sm">
          {description}
        </p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
