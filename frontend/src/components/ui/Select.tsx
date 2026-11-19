"use client";

import React, { forwardRef } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  error?: boolean | string;
  options?: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, options, placeholder, children, className = "", disabled, ...props }, ref) => {
    const hasError = Boolean(error);

    return (
      <div className="relative w-full">
        <select
          ref={ref}
          disabled={disabled}
          className={`w-full h-9 rounded-lg border bg-white pl-3 pr-8 text-[12px] text-[#0B3D2B] appearance-none transition-colors focus:outline-none focus:ring-1 disabled:bg-[#F7F7F5] disabled:cursor-not-allowed dark:bg-[#0C2620] dark:text-[#F7F7F5] dark:disabled:bg-[#071713] ${
            hasError
              ? "border-[#DC2626] focus:border-[#DC2626] focus:ring-[#DC2626]"
              : "border-[#E8E8E5] hover:border-[#D4D4CE] focus:border-[#10B981] focus:ring-[#10B981] dark:border-[#1B5039] dark:hover:border-[#20557B]"
          } ${className}`}
          {...props}
        >
          {placeholder && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-[#737373] dark:text-[#94A3B8]"
          aria-hidden="true"
        />
      </div>
    );
  }
);

Select.displayName = "Select";
