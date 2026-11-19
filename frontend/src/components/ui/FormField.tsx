"use client";

import React from "react";

export interface FormFieldProps {
  label?: string;
  required?: boolean;
  error?: string | boolean;
  helpText?: string;
  htmlFor?: string;
  children: React.ReactNode;
  className?: string;
}

export function FormField({
  label,
  required = false,
  error,
  helpText,
  htmlFor,
  children,
  className = "",
}: FormFieldProps) {
  const errorMessage = typeof error === "string" ? error : "";

  return (
    <div className={`space-y-1.5 ${className}`}>
      {label && (
        <div className="flex items-center justify-between">
          <label
            htmlFor={htmlFor}
            className="block text-[11px] font-semibold text-[#0B3D2B] tracking-[0.02em] dark:text-[#F7F7F5]"
          >
            {label}
            {required && (
              <span className="text-[#DC2626] ml-1" aria-hidden="true">
                *
              </span>
            )}
          </label>
        </div>
      )}

      <div>{children}</div>

      {helpText && !errorMessage && (
        <p className="text-[11px] text-[#737373] dark:text-[#94A3B8] leading-tight">
          {helpText}
        </p>
      )}

      {errorMessage && (
        <p className="text-[11px] font-medium text-[#DC2626] leading-tight" role="alert">
          {errorMessage}
        </p>
      )}
    </div>
  );
}
