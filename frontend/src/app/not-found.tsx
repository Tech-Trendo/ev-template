import type { Metadata } from "next";
import ErrorPageShell from "@/components/ErrorPageShell";

export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return <ErrorPageShell code={404} />;
}
