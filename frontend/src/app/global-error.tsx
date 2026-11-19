"use client";

import { useEffect } from "react";
import "@/index.css";

export default function GlobalError({
  error,
  reset,
  retry,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const onRetry = () => (typeof retry === "function" ? retry() : reset());

  return (
    <html lang="en">
      <body className="min-h-screen bg-white font-sans text-[#04314A] antialiased">
        <main className="min-h-screen flex items-center justify-center py-20 px-6">
          <div className="max-w-xl w-full text-center">
            <p className="text-[12px] font-bold tracking-[0.2em] uppercase text-[#00AAEB] mb-3">
              Error 500
            </p>
            <h1 className="text-[32px] sm:text-[40px] font-black text-[#04314A] tracking-tight mb-4">
              Something went wrong
            </h1>
            <p className="text-[15px] text-[#737373] leading-relaxed mb-8 max-w-md mx-auto">
              An unexpected error occurred on our side. Please try again in a
              moment.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={onRetry}
                className="px-5 py-2.5 rounded-md bg-[#04314A] text-white text-[13px] font-semibold hover:bg-[#00AAEB] transition-colors"
              >
                Try again
              </button>
              <a
                href="/dashboard"
                className="px-5 py-2.5 rounded-md border border-[#04314A] text-[#04314A] text-[13px] font-semibold hover:bg-[#04314A] hover:text-white transition-colors"
              >
                Go to dashboard
              </a>
            </div>
            {error.digest ? (
              <p className="text-[11px] text-[#A3A3A3] mt-6 font-mono">
                Ref: {error.digest}
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
