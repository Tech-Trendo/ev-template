"use client";

import React, { forwardRef } from "react";

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean | string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, className = "", disabled, rows = 3, ...props }, ref) => {
    const hasError = Boolean(error);

    return (
      <textarea
        ref={ref}
        disabled={disabled}
        rows={rows}
        className={`w-full rounded-lg border bg-white p-3 text-[12px] text-[#04314A] transition-colors placeholder:text-[#A3A39E] focus:outline-none focus:ring-1 disabled:bg-[#F7F7F5] disabled:cursor-not-allowed dark:bg-[#0B2538] dark:text-[#F7F7F5] dark:placeholder:text-[#64748B] dark:disabled:bg-[#061824] ${
          hasError
            ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]"
            : "border-[#E8E8E5] hover:border-[#D4D4CE] focus:border-[#00AAEB] focus:ring-[#00AAEB] dark:border-[#174261] dark:hover:border-[#20557B]"
        } ${className}`}
        {...props}
      />
    );
  }
);

Textarea.displayName = "Textarea";
