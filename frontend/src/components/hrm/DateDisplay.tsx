"use client";

import { CalendarRangeError, adToBs, formatAd, formatBs } from "@/lib/hrm/bsCalendar";

type DateDisplayProps = {
  value: string | null | undefined;
  mode?: "both" | "bs" | "ad";
  className?: string;
};

export default function DateDisplay({ value, mode = "both", className = "" }: DateDisplayProps) {
  if (!value) {
    return <span className={className}>—</span>;
  }
  const iso = value.slice(0, 10);
  let bs = "";
  let ad = iso;
  try {
    ad = formatAd(iso);
    bs = formatBs(adToBs(iso));
  } catch (error) {
    if (!(error instanceof CalendarRangeError)) throw error;
    return <span className={className}>{iso}</span>;
  }

  if (mode === "bs") return <span className={className}>{bs}</span>;
  if (mode === "ad") return <span className={className}>{ad}</span>;
  return (
    <span className={className}>
      <span className="font-medium">{bs}</span>
      <span className="text-[#737373] dark:text-[#94A3B8]"> · {ad}</span>
    </span>
  );
}
