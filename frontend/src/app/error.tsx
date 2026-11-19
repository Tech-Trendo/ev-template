"use client";

import { useEffect } from "react";
import ErrorPageShell from "@/components/ErrorPageShell";

export default function Error({
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

  return (
    <ErrorPageShell
      code={500}
      digest={error.digest}
      onRetry={() => (typeof retry === "function" ? retry() : reset())}
    />
  );
}
