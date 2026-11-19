"use client";

import { Link } from "@/lib/router";

export type ErrorCode = 400 | 401 | 403 | 404 | 500 | 502 | 503;

const COPY: Record<
  ErrorCode,
  { label: string; title: string; description: string }
> = {
  400: {
    label: "Error 400",
    title: "Bad request",
    description: "The request could not be understood. Check the address and try again.",
  },
  401: {
    label: "Error 401",
    title: "Sign in required",
    description: "You need to be signed in to view this page.",
  },
  403: {
    label: "Error 403",
    title: "Access denied",
    description: "You do not have permission to view this page.",
  },
  404: {
    label: "Error 404",
    title: "This page does not exist",
    description: "The page may have moved, been deleted, or the address might contain a typo.",
  },
  500: {
    label: "Error 500",
    title: "Something went wrong",
    description: "An unexpected error occurred. Please try again in a moment.",
  },
  502: {
    label: "Error 502",
    title: "Bad gateway",
    description: "We couldn’t reach a required service. Please try again shortly.",
  },
  503: {
    label: "Error 503",
    title: "Service unavailable",
    description: "We’re temporarily unavailable for maintenance. Please check back soon.",
  },
};

type Props = {
  code: ErrorCode;
  title?: string;
  description?: string;
  onRetry?: () => void;
  digest?: string;
};

export default function ErrorPageShell({ code, title, description, onRetry, digest }: Props) {
  const copy = COPY[code];

  return (
    <main className="min-h-screen flex items-center justify-center bg-[#F7F7F5] px-6 py-20">
      <div className="max-w-lg w-full text-center">
        <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#10B981] mb-3">
          {copy.label}
        </p>
        <h1 className="text-[32px] sm:text-[40px] font-black text-[#0B3D2B] tracking-tight mb-4">
          {title ?? copy.title}
        </h1>
        <p className="text-[15px] text-[#64748B] leading-relaxed mb-8 max-w-md mx-auto">
          {description ?? copy.description}
        </p>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="px-5 py-2.5 rounded-md bg-[#0B3D2B] text-white text-[13px] font-semibold hover:bg-[#10B981] transition-colors"
            >
              Try again
            </button>
          ) : null}
          <Link
            href="/dashboard"
            className="px-5 py-2.5 rounded-md bg-[#0B3D2B] text-white text-[13px] font-semibold hover:bg-[#10B981] transition-colors"
          >
            Go to dashboard
          </Link>
          <Link
            href="/auth/login"
            className="px-5 py-2.5 rounded-md border border-[#0B3D2B] text-[#0B3D2B] text-[13px] font-semibold hover:bg-[#0B3D2B] hover:text-white transition-colors"
          >
            Sign in
          </Link>
        </div>

        {digest ? (
          <p className="text-[11px] text-[#A3A39E] mt-6 font-mono">Ref: {digest}</p>
        ) : null}
      </div>
    </main>
  );
}
