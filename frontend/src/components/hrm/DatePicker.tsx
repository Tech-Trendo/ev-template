"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Button, Select } from "@/components/ui";
import {
  CalendarRangeError,
  MONTH_NAMES,
  adToBs,
  bsToAd,
  daysInBsMonth,
  formatPair,
  supportedRange,
  weekdayIndex,
} from "@/lib/hrm/bsCalendar";

const SUNDAY_FIRST = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const AD_MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type DatePickerProps = {
  value: string | null;
  onChange: (iso: string | null) => void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
};

export default function DatePicker({
  value,
  onChange,
  id,
  disabled,
  placeholder = "Select date",
}: DatePickerProps) {
  const range = supportedRange();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"bs" | "ad">("bs");
  const [bsYear, setBsYear] = useState(2083);
  const [bsMonth, setBsMonth] = useState(1);
  const [adCursor, setAdCursor] = useState(range.minAd);
  const [focusedDay, setFocusedDay] = useState(1);
  const [error, setError] = useState("");

  useEffect(() => {
    const initial = value ? safeBs(value) : null;
    if (initial) {
      setBsYear(initial.year);
      setBsMonth(initial.month);
      setFocusedDay(initial.day);
      setAdCursor(value!.slice(0, 10));
    } else {
      const today = new Date();
      const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
      const clamped =
        todayIso < range.minAd ? range.minAd : todayIso > range.maxAd ? range.maxAd : todayIso;
      const todayBs = safeBs(clamped);
      if (todayBs) {
        setBsYear(todayBs.year);
        setBsMonth(todayBs.month);
        setFocusedDay(todayBs.day);
      }
      setAdCursor(clamped);
    }
  }, [value, range.maxAd, range.minAd]);

  useEffect(() => {
    if (!open) return;
    function onPointer(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const adParts = split(adCursor);
  const year = mode === "bs" ? bsYear : adParts.year;
  const month = mode === "bs" ? bsMonth : adParts.month;
  const length = mode === "bs" ? daysInBsMonth(bsYear, bsMonth) : daysInMonth(adParts.year, adParts.month);
  const firstIso = mode === "bs" ? bsToAd(bsYear, bsMonth, 1) : `${adParts.year}-${pad(adParts.month)}-01`;
  const leading = (weekdayIndex(firstIso) + 1) % 7;

  const years = useMemo(() => {
    if (mode === "bs") return rangeInclusive(range.minYear, range.maxYear);
    return rangeInclusive(Number(range.minAd.slice(0, 4)), Number(range.maxAd.slice(0, 4)));
  }, [mode, range.maxAd, range.maxYear, range.minAd, range.minYear]);

  const selected = value ? safePair(value) : null;
  const triggerLabel = selected ? `${selected.bs} · ${selected.ad}` : placeholder;

  function selectDay(day: number) {
    try {
      const iso = mode === "bs" ? bsToAd(bsYear, bsMonth, day) : `${adParts.year}-${pad(adParts.month)}-${pad(day)}`;
      if (iso < range.minAd || iso > range.maxAd) {
        setError(`Outside supported range (${range.minAd} – ${range.maxAd}).`);
        return;
      }
      setError("");
      setFocusedDay(day);
      onChange(iso);
      setOpen(false);
    } catch (caught) {
      setError(caught instanceof CalendarRangeError ? caught.message : "That date is not valid.");
    }
  }

  function shiftMonth(delta: number) {
    if (mode === "bs") {
      let nextMonth = bsMonth + delta;
      let nextYear = bsYear;
      if (nextMonth < 1) {
        nextMonth = 12;
        nextYear -= 1;
      } else if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
      }
      if (nextYear < range.minYear || nextYear > range.maxYear) return;
      setBsYear(nextYear);
      setBsMonth(nextMonth);
      return;
    }
    const base = new Date(Date.UTC(adParts.year, adParts.month - 1 + delta, 1));
    const next = `${base.getUTCFullYear()}-${pad(base.getUTCMonth() + 1)}-01`;
    if (next < range.minAd.slice(0, 7) || next > range.maxAd.slice(0, 7)) return;
    setAdCursor(next);
  }

  function moveFocus(delta: number) {
    const next = focusedDay + delta;
    if (next < 1 || next > length) return;
    setFocusedDay(next);
    document.getElementById(dayId(id, next))?.focus();
  }

  return (
    <div ref={rootRef} className="relative w-full">
      <div className="relative">
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={open}
          onClick={() => !disabled && setOpen((current) => !current)}
          className={`flex h-9 w-full items-center gap-2 rounded-lg border bg-white px-3 pr-9 text-left text-[12px] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#10B981] disabled:cursor-not-allowed disabled:bg-[#F7F7F5] dark:bg-[#0C2620] dark:disabled:bg-[#071713] ${
            open
              ? "border-[#10B981] ring-1 ring-[#10B981]"
              : "border-[#E8E8E5] hover:border-[#D4D4CE] dark:border-[#1B5039] dark:hover:border-[#20557B]"
          }`}
        >
          <Calendar size={14} className="shrink-0 text-[#737373]" />
          <span
            className={`min-w-0 flex-1 truncate ${
              selected ? "font-medium text-[#0B3D2B] dark:text-[#F7F7F5]" : "text-[#A3A39E]"
            }`}
          >
            {triggerLabel}
          </span>
        </button>
        {value ? (
          <button
            type="button"
            aria-label="Clear date"
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-[#737373] hover:bg-[#F0F0ED] hover:text-[#0B3D2B] disabled:opacity-50 dark:hover:bg-[#071713]"
            onClick={() => onChange(null)}
          >
            <X size={13} />
          </button>
        ) : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Choose date"
          className="absolute left-0 right-0 z-40 mt-1.5 rounded-xl border border-[#E8E8E5] bg-white p-3 shadow-lg dark:border-[#1B5039] dark:bg-[#0C2620] sm:left-auto sm:right-auto sm:w-[300px]"
        >
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="inline-flex rounded-lg border border-[#E8E8E5] p-0.5 dark:border-[#1B5039]">
              <button
                type="button"
                aria-pressed={mode === "bs"}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  mode === "bs" ? "bg-[#0B3D2B] text-white" : "text-[#737373] hover:text-[#0B3D2B]"
                }`}
                onClick={() => setMode("bs")}
              >
                BS
              </button>
              <button
                type="button"
                aria-pressed={mode === "ad"}
                className={`rounded-md px-2.5 py-1 text-[11px] font-semibold ${
                  mode === "ad" ? "bg-[#0B3D2B] text-white" : "text-[#737373] hover:text-[#0B3D2B]"
                }`}
                onClick={() => setMode("ad")}
              >
                AD
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Previous month"
                className="rounded-md p-1 text-[#737373] hover:bg-[#F0F0ED] hover:text-[#0B3D2B] dark:hover:bg-[#071713]"
                onClick={() => shiftMonth(-1)}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                aria-label="Next month"
                className="rounded-md p-1 text-[#737373] hover:bg-[#F0F0ED] hover:text-[#0B3D2B] dark:hover:bg-[#071713]"
                onClick={() => shiftMonth(1)}
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          <div className="mb-2 grid grid-cols-2 gap-2">
            <Select
              aria-label={mode === "bs" ? "Bikram Sambat year" : "Gregorian year"}
              value={year}
              options={years.map((item) => ({ value: item, label: String(item) }))}
              onChange={(event) => {
                const next = Number(event.target.value);
                if (mode === "bs") setBsYear(next);
                else setAdCursor(`${next}-${pad(adParts.month)}-01`);
              }}
            />
            <Select
              aria-label={mode === "bs" ? "Bikram Sambat month" : "Gregorian month"}
              value={month}
              options={
                mode === "bs"
                  ? MONTH_NAMES.map((name, index) => ({ value: index + 1, label: name }))
                  : AD_MONTH_NAMES.map((name, index) => ({ value: index + 1, label: name }))
              }
              onChange={(event) => {
                const next = Number(event.target.value);
                if (mode === "bs") setBsMonth(next);
                else setAdCursor(`${adParts.year}-${pad(next)}-01`);
              }}
            />
          </div>

          <div
            role="grid"
            aria-label={
              mode === "bs"
                ? `${MONTH_NAMES[bsMonth - 1]} ${bsYear}`
                : `${AD_MONTH_NAMES[adParts.month - 1]} ${adParts.year}`
            }
            className="grid grid-cols-7 gap-0.5"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") {
                event.preventDefault();
                moveFocus(1);
              } else if (event.key === "ArrowLeft") {
                event.preventDefault();
                moveFocus(-1);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                moveFocus(7);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                moveFocus(-7);
              }
            }}
          >
            {SUNDAY_FIRST.map((name) => (
              <div key={name} role="columnheader" className="py-1 text-center text-[10px] font-semibold text-[#737373]">
                {name}
              </div>
            ))}
            {Array.from({ length: leading }, (_, index) => (
              <div key={`pad-${index}`} role="gridcell" />
            ))}
            {Array.from({ length }, (_, index) => {
              const day = index + 1;
              const iso =
                mode === "bs" ? bsToAd(bsYear, bsMonth, day) : `${adParts.year}-${pad(adParts.month)}-${pad(day)}`;
              const outOfRange = iso < range.minAd || iso > range.maxAd;
              const selectedDay = value?.slice(0, 10) === iso;
              const label = safePair(iso);
              return (
                <button
                  key={day}
                  id={dayId(id, day)}
                  type="button"
                  role="gridcell"
                  disabled={outOfRange}
                  aria-selected={selectedDay}
                  aria-label={label ? `${label.bs}, ${label.ad}` : iso}
                  tabIndex={day === Math.min(focusedDay, length) ? 0 : -1}
                  className={`h-8 rounded-md text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#10B981] disabled:opacity-30 ${
                    selectedDay
                      ? "bg-[#0B3D2B] font-semibold text-white"
                      : "text-[#0B3D2B] hover:bg-[#F0F0ED] dark:text-[#F7F7F5] dark:hover:bg-[#071713]"
                  }`}
                  onClick={() => selectDay(day)}
                  onFocus={() => setFocusedDay(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-[10px] text-[#737373]">Stored as Gregorian (AD). Toggle BS to pick local-calendar dates.</p>
          {error ? (
            <p className="mt-1 text-[12px] text-[#DC2626]" role="alert">
              {error}
            </p>
          ) : null}
          <div className="mt-2 flex justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function dayId(id: string | undefined, day: number) {
  return `${id || "hr-date"}-day-${day}`;
}

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function split(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return { year, month, day };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function rangeInclusive(start: number, end: number) {
  const values: number[] = [];
  for (let value = start; value <= end; value += 1) values.push(value);
  return values;
}

function safeBs(iso: string) {
  try {
    return adToBs(iso);
  } catch {
    return null;
  }
}

function safePair(iso: string) {
  try {
    return formatPair(iso);
  } catch {
    return null;
  }
}
