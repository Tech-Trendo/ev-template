"use client";

import React, { forwardRef } from "react";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  error?: boolean | string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, leftIcon, rightIcon, className = "", disabled, ...props }, ref) => {
    const hasError = Boolean(error);

    return (
      <div className="relative w-full">
        {leftIcon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none text-[#737373] dark:text-[#94A3B8]">
            {leftIcon}
          </div>
        )}
        <input
          ref={ref}
          disabled={disabled}
          className={`w-full h-9 rounded-lg border bg-white px-3 text-[12px] text-[#04314A] transition-colors placeholder:text-[#A3A39E] focus:outline-none focus:ring-1 disabled:bg-[#F7F7F5] disabled:cursor-not-allowed dark:bg-[#0B2538] dark:text-[#F7F7F5] dark:placeholder:text-[#64748B] dark:disabled:bg-[#061824] ${
            leftIcon ? "pl-9" : ""
          } ${rightIcon ? "pr-9" : ""} ${
            hasError
              ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]"
              : "border-[#E8E8E5] hover:border-[#D4D4CE] focus:border-[#00AAEB] focus:ring-[#00AAEB] dark:border-[#174261] dark:hover:border-[#20557B]"
          } ${className}`}
          {...props}
        />
        {rightIcon && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 text-[#737373] dark:text-[#94A3B8]">
            {rightIcon}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
