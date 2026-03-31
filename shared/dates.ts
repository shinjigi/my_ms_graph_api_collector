/** Shared date & time utilities — single source of truth for both FE and BE. */

export const MONTH_IT = [
  "Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno",
  "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"
];

export const DAYABB_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

/** Returns a new Date object set to today at local midnight. */
export function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Formats a Date object to YYYY-MM-DD using local time (avoiding UTC shift). */
export function dateToString(d: Date | string = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${day}`;
}

/** Returns the current month as "YYYY-MM" (local). */
export function currentMonthString(d: Date | string = new Date()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  const yr = date.getFullYear();
  const mo = String(date.getMonth() + 1).padStart(2, "0");
  return `${yr}-${mo}`;
}

/** Adds `days` calendar days to a YYYY-MM-DD string or Date. Returns YYYY-MM-DD. */
export function shiftDate(input: string | Date, days: number): string {
  const d = new Date(input);
  d.setDate(d.getDate() + days);
  return dateToString(d);
}

/** Returns the Monday of the week containing the given date. */
export function getMonday(input: Date | string): Date {
  const d = new Date(input);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

/** Parses "YYYY-MM-DD" back to a Date object (using local midnight). */
export function parseDateString(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Returns a label like "Lun 31 Mar". */
export function formatDateLabel(input: Date | string): string {
  const d = typeof input === "string" ? parseDateString(input) : input;
  const dow = DAYABB_IT[d.getDay()];
  const mon = MONTH_IT[d.getMonth()];
  return `${dow} ${d.getDate()} ${mon}`;
}

/** Returns the last day of a month as "YYYY-MM-DD". Month is "YYYY-MM". */
export function lastDayOfMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return dateToString(new Date(y, m, 0));
}

/** Returns "HH:mm:ss" or "HHmmss" (if no separator). Uses local time. */
export function getTimeString(d: Date = new Date(), separator = ":"): string {
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const ss = String(d.getSeconds()).padStart(2, "0");
  return [hh, mm, ss].join(separator);
}

/** Returns "YYYY-MM-DD_HHmmss". Useful for filenames. */
export function getTimestampFilename(d: Date = new Date()): string {
  return `${dateToString(d)}_${getTimeString(d, "")}`;
}

/** Returns the full ISO 8601 string (e.g. "2026-03-31T14:30:00.000Z") */
export function getISOTimestamp(d: Date = new Date()): string {
  return d.toISOString();
}

/** Returns only the date part of ISO string (e.g. "2026-03-31") */
export function getISODate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/** 
 * Parses a TargetProcess date string in /Date(ms±hhmm)/ format.
 * Returns ISO date string (YYYY-MM-DD) or '-' if input is falsy.
 */
export function parseTpDate(tpDate: string | null | undefined): string {
  if (!tpDate) return "-";
  const match = /\/Date\((\d+)([+-])(\d{2})(\d{2})\)\//.exec(tpDate);
  if (!match) return "-";
  const ms = Number.parseInt(match[1], 10);
  const sign = match[2] === "+" ? 1 : -1;
  const tzMs = sign * (Number.parseInt(match[3], 10) * 60 + Number.parseInt(match[4], 10)) * 60_000;
  return dateToString(new Date(ms + tzMs));
}

/** Converts decimal hours to HH:MM string, e.g. 7.7 → "7:42". */
export function hoursToHhmm(h: number): string {
  const totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = Math.abs(totalMinutes % 60);
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

/** Parses an HH:MM or H:MM string to decimal hours, e.g. "7:42" → 7.7. */
export function hhmmToHours(hhmm: string): number {
  if (!hhmm || !hhmm.includes(":")) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m ?? 0) / 60;
}
