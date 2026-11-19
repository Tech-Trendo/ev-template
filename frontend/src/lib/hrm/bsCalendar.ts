/**
 * Bikram Sambat conversion. Same day-count as backend/hrm/calendar.py,
 * from the same bs_month_lengths.json. Years after Chaitra 2083 are refused.
 */

import table from "./bs_month_lengths.json";

export const MONTH_NAMES = [
  "Baisakh",
  "Jestha",
  "Ashadh",
  "Shrawan",
  "Bhadra",
  "Ashwin",
  "Kartik",
  "Mangsir",
  "Poush",
  "Magh",
  "Falgun",
  "Chaitra",
] as const;

export const WEEKDAY_NAMES = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
] as const;

const AD_MONTHS = [
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

const NEPALI_DIGITS = "०१२३४५६७८९";

type MonthTable = {
  epoch_bs: number[];
  epoch_ad: string;
  min_year: number;
  max_year: number;
  months: Record<string, number[]>;
};

const data = table as MonthTable;
const EPOCH_DAYS = isoToDays(data.epoch_ad);
const manualMonths: Record<string, number[]> = {};

export function installManualYears(months: Record<string, number[]> | undefined) {
  for (const key of Object.keys(manualMonths)) delete manualMonths[key];
  if (!months) return;
  for (const [year, lengths] of Object.entries(months)) {
    if (Number(year) > data.max_year && Array.isArray(lengths) && lengths.length === 12) {
      manualMonths[year] = lengths.map((days) => Number(days));
    }
  }
}

function coveredMaxYear(): number {
  let year = data.max_year;
  while (manualMonths[String(year + 1)]) year += 1;
  return year;
}

export class CalendarRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CalendarRangeError";
  }
}

export type BSDate = {
  year: number;
  month: number;
  day: number;
  monthName: string;
};

export function monthName(month: number): string {
  if (month < 1 || month > 12) {
    throw new CalendarRangeError(`BS month must be 1-12, got ${month}.`);
  }
  return MONTH_NAMES[month - 1];
}

export function toNepaliDigits(value: string): string {
  return value.replace(/\d/g, (digit) => NEPALI_DIGITS[Number(digit)]);
}

export function supportedRange(): { minYear: number; maxYear: number; minAd: string; maxAd: string } {
  const lastYear = coveredMaxYear();
  const lastDays = yearLengths(lastYear)[11];
  return {
    minYear: data.min_year,
    maxYear: lastYear,
    minAd: data.epoch_ad,
    maxAd: bsToAd(lastYear, 12, lastDays),
  };
}

export function daysInBsMonth(year: number, month: number): number {
  const lengths = yearLengths(year);
  if (month < 1 || month > 12) {
    throw new CalendarRangeError(`BS month must be 1-12, got ${month}.`);
  }
  return lengths[month - 1];
}

export function bsToAd(year: number, month: number, day: number): string {
  const lengths = yearLengths(year);
  if (month < 1 || month > 12) {
    throw new CalendarRangeError(`BS month must be 1-12, got ${month}.`);
  }
  const length = lengths[month - 1];
  if (day < 1 || day > length) {
    throw new CalendarRangeError(
      `BS ${year}-${pad(month)}-${pad(day)} is not a real day. ${monthName(month)} ${year} has ${length} days.`,
    );
  }
  let offset = 0;
  for (let y = data.min_year; y < year; y += 1) {
    offset += data.months[String(y)].reduce((sum, days) => sum + days, 0);
  }
  offset += lengths.slice(0, month - 1).reduce((sum, days) => sum + days, 0);
  offset += day - 1;
  return daysToIso(EPOCH_DAYS + offset);
}

export function adToBs(iso: string): BSDate {
  const ad = normalizeIso(iso);
  const adDays = isoToDays(ad);
  if (adDays < EPOCH_DAYS) {
    throw new CalendarRangeError(
      `${ad} is before the verified calendar, which starts on ${data.epoch_ad} (BS 1975-01-01).`,
    );
  }
  let remaining = adDays - EPOCH_DAYS;
  const lastYear = coveredMaxYear();
  for (let year = data.min_year; year <= lastYear; year += 1) {
    const lengths = yearLengths(year);
    const yearDays = lengths.reduce((sum, days) => sum + days, 0);
    if (remaining < yearDays) {
      for (let month = 1; month <= 12; month += 1) {
        const length = lengths[month - 1];
        if (remaining < length) {
          return {
            year,
            month,
            day: remaining + 1,
            monthName: MONTH_NAMES[month - 1],
          };
        }
        remaining -= length;
      }
    }
    remaining -= yearDays;
  }
  const lastDay = yearLengths(lastYear)[11];
  const last = bsToAd(lastYear, 12, lastDay);
  throw new CalendarRangeError(
    `${ad} is after the verified calendar, which ends on ${last} (BS ${lastYear}-12-${lastDay}).`,
  );
}

export function formatBs(bs: BSDate, nepaliDigits = false): string {
  const text = `${bs.day} ${bs.monthName} ${bs.year}`;
  return nepaliDigits ? toNepaliDigits(text) : text;
}

export function formatAd(iso: string): string {
  const { year, month, day } = splitIso(normalizeIso(iso));
  return `${AD_MONTHS[month - 1]} ${day}, ${year}`;
}

export function formatPair(iso: string): { bs: string; ad: string } {
  const ad = normalizeIso(iso);
  return { bs: formatBs(adToBs(ad)), ad: formatAd(ad) };
}

export function weekdayIndex(iso: string): number {
  const { year, month, day } = splitIso(normalizeIso(iso));
  const sundayBased = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return (sundayBased + 6) % 7;
}

export function weekdayName(iso: string): string {
  return WEEKDAY_NAMES[weekdayIndex(iso)];
}

export function addDays(iso: string, days: number): string {
  return daysToIso(isoToDays(normalizeIso(iso)) + days);
}

function yearLengths(year: number): number[] {
  const manual = manualMonths[String(year)];
  if (manual && year > data.max_year && year <= coveredMaxYear()) return manual;
  const lengths = data.months[String(year)];
  if (!lengths) {
    throw new CalendarRangeError(
      `BS ${year} is outside the verified calendar (${data.min_year}-${coveredMaxYear()}). ` +
        "Later years are not converted until a Super Admin enters the official month lengths.",
    );
  }
  return lengths;
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function splitIso(iso: string): { year: number; month: number; day: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) {
    throw new CalendarRangeError(`Expected a Gregorian date YYYY-MM-DD, got ${iso}.`);
  }
  return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

function normalizeIso(iso: string): string {
  const { year, month, day } = splitIso(iso.slice(0, 10));
  const check = new Date(Date.UTC(year, month - 1, day));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new CalendarRangeError(`${iso} is not a real Gregorian date.`);
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

function isoToDays(iso: string): number {
  const { year, month, day } = splitIso(iso);
  return Math.floor(Date.UTC(year, month - 1, day) / 86400000);
}

function daysToIso(days: number): string {
  const date = new Date(days * 86400000);
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}
