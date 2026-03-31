/**
 * Shared date & time utilities — single source of truth for both FE and BE.
 * Provides centralized operations avoiding local-to-UTC mapping bugs.
 */

export const MONTH_IT = [
  "Gennaio",
  "Febbraio",
  "Marzo",
  "Aprile",
  "Maggio",
  "Giugno",
  "Luglio",
  "Agosto",
  "Settembre",
  "Ottobre",
  "Novembre",
  "Dicembre",
];

export const DAYABB_IT = ["Dom", "Lun", "Mar", "Mer", "Gio", "Ven", "Sab"];

/**
 * Returns a new Date object set to today at local midnight.
 *
 * @returns {Date} A Date object representing 00:00:00 of the current local day.
 */
export function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Formats a given Date or string to "YYYY-MM-DD" using local time safely.
 *
 * @param {Date | string} [d=new Date()] - The Date instance or valid string date (e.g., "YYYY-MM" or "YYYY-MM-DD") to format.
 * @returns {string} The localized representation string formatted exactly as "YYYY-MM-DD".
 */
export function dateToString(d: Date | string = new Date()): string {
  const date = typeof d === "string" ? parseDateString(d) : d;
  const { year, month } = getYearMonth(date);
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${String(month).padStart(2, "0")}-${day}`;
}

/**
 * Extracts and returns the current month portion "YYYY-MM" of a local date.
 *
 * @param {Date | string} [d=new Date()] - The Date instance or valid string date (e.g., "YYYY-MM-DD" or "YYYY-MM").
 * @returns {string} The formatted local year-month string exactly as "YYYY-MM".
 */
export function currentMonthString(d: Date | string = new Date()): string {
  const { year, month } = getYearMonth(d);
  return `${year}-${String(month).padStart(2, "0")}`;
}

/**
 * Shifts the input date by a specified number of calendar days.
 *
 * @param {string | Date} input - Baseline date to shift (if string, must be "YYYY-MM" or "YYYY-MM-DD").
 * @param {number} days - Amount of days to add (or subtract if negative).
 * @returns {string} The shifted date string formatted exactly as "YYYY-MM-DD".
 */
export function shiftDate(input: string | Date, days: number): string {
  const d =
    typeof input === "string" ? parseDateString(input) : new Date(input);
  d.setDate(d.getDate() + days);
  return dateToString(d);
}

/**
 * Calculates the Monday of the week containing the provided local date.
 * Relies on the standard assumption where week starts on Monday.
 *
 * @param {Date | string} input - Any date indicating the target week (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {Date} The mutated local Date object adjusted back to Monday 00:00:00.
 */
export function getMonday(input: Date | string): Date {
  const d =
    typeof input === "string" ? parseDateString(input) : new Date(input);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay(); // 0 = Sun
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

/**
 * Parses "YYYY-MM" or "YYYY-MM-DD" safe fallback dates to a local Date object.
 * Prevents UTC-0 boundary hopping default implementations enforce.
 *
 * @param {string} dateStr - Date string, explicitly accepts "YYYY-MM-DD" or "YYYY-MM" (which defaults to the 1st of the month).
 * @returns {Date} Native instantiated local Date boundary matching exactly the parsed values at 00:00.
 */
export function parseDateString(dateStr: string): Date {
  const parts = dateStr.split("-");
  const y = Number.parseInt(parts[0], 10);
  const m = Number.parseInt(parts[1], 10);
  const d = parts[2] ? Number.parseInt(parts[2], 10) : 1;
  return new Date(y, m - 1, d);
}

/**
 * Computes standard Year and Month indexes (base 1-12) locally.
 *
 * @param {Date | string} [input=new Date()] - Date object or string (format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {{ year: number; month: number }} Integer numerical mappings of the year and localized calendar month length (1-12).
 */
export function getYearMonth(input: Date | string = new Date()): {
  year: number;
  month: number;
} {
  if (typeof input === "string") {
    const parts = input.split("-");
    const year = Number.parseInt(parts[0], 10);
    const month = Number.parseInt(parts[1], 10);
    return { year, month };
  }
  return { year: input.getFullYear(), month: input.getMonth() + 1 };
}

/**
 * Returns the maximum amount of integer days within a designated Year/Month.
 *
 * @param {number} year - The exact Year integer (e.g., 2026).
 * @param {number} month - The exact Month integer index (1-INDEXED, like 1=January, 12=December).
 * @returns {number} Integer representing max days capacity for that specific period.
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Performs local addition or subtraction of calendar months securely avoiding edge boundaries.
 *
 * @param {Date | string} input - The start origin boundary element (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @param {number} months - Delta iteration bounds (for instance: -1 steps backward 1 Month).
 * @returns {Date} Valid new Date object reflecting arithmetic adjustments safely resolved locally.
 */
export function addMonths(input: Date | string, months: number): Date {
  const d =
    typeof input === "string" ? parseDateString(input) : new Date(input);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Flattens the exact Date back to its 1st of the identical Month local time context.
 *
 * @param {Date | string} [input=new Date()] - Origin date element (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {Date} Reinstated localized native 00:00 Date strictly on day '1'.
 */
export function startOfMonth(input: Date | string = new Date()): Date {
  const { year, month } = getYearMonth(input);
  return new Date(year, month - 1, 1);
}

/**
 * Extracts sequence Array populated entirely with sequentially incrementing "YYYY-MM" month markers.
 *
 * @param {Date | string} start - Chronological loop initializing sequence trigger (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @param {Date | string} end - Terminating cap sequence marker indicator (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {string[]} An Array of standard iteration labels strictly formatted as "YYYY-MM" (e.g., ["2026-03", "2026-04"]).
 */
export function getMonthRange(
  start: Date | string,
  end: Date | string,
): string[] {
  const s = typeof start === "string" ? parseDateString(start) : start;
  const e = typeof end === "string" ? parseDateString(end) : end;

  let current = startOfMonth(s);
  const endRef = startOfMonth(e);

  const months: string[] = [];
  while (current <= endRef) {
    months.push(currentMonthString(current));
    current = addMonths(current, 1);
  }
  return months;
}

/**
 * Parses to formal visual representation suffix localized string. Example: "Lun 31 Mar".
 *
 * @param {Date | string} input - Parsing context (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {string} Capitalized standard localized identifier string (e.g., "Lun 31 Mar").
 */
export function formatDateLabel(input: Date | string): string {
  const d = typeof input === "string" ? parseDateString(input) : input;
  const dow = DAYABB_IT[d.getDay()];
  const mon = MONTH_IT[d.getMonth()];
  return `${dow} ${d.getDate()} ${mon}`;
}

/**
 * Shortened alternative format standard suffix localized string. Example: "31 Mar".
 *
 * @param {Date | string} input - Incoming date properties contextual indicator (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {string} Truncated string mapping ignoring Days of Week specificators (e.g., "31 Mar").
 */
export function formatShortDateLabel(input: Date | string): string {
  const d = typeof input === "string" ? parseDateString(input) : input;
  return `${d.getDate()} ${MONTH_IT[d.getMonth()].substring(0, 3)}`;
}

/**
 * Full spelling standard mapping. Example: "Marzo 2026".
 *
 * @param {Date | string} input - Evaluating standard reference scope (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {string} Clean textual representation emitting standard precise dates indicators (e.g., "Marzo 2026").
 */
export function formatMonthYearLabel(input: Date | string): string {
  const { year, month } = getYearMonth(input);
  return `${MONTH_IT[month - 1]} ${year}`;
}

/**
 * Resolves standard iteration mappings up to end-of-calendar Month standard date limit.
 *
 * @param {Date | string} input - Target calendar context (if string, format "YYYY-MM" or "YYYY-MM-DD").
 * @returns {string} Strict numerical array representation exactly matching the Month final bounds like "2026-03-31".
 */
export function lastDayOfMonth(input: Date | string): string {
  const { year, month } = getYearMonth(input);
  return dateToString(new Date(year, month, 0));
}

/**
 * Reverts an explicit ISO Week standard syntax "2026-W13" completely resolved backward into start/end range dates.
 *
 * @param {string} weekStr - Strict defined string representing standard explicit Week sequence mappings. Must be formatted as "YYYY-WXX" (e.g., "2026-W13").
 * @returns {{ start: string; end: string }} Object containing exact "YYYY-MM-DD" boundaries formatting matched localized properties.
 */
export function getWeekBoundsFromStr(weekStr: string): {
  start: string;
  end: string;
} {
  const parts = weekStr.split("-");
  const year = Number.parseInt(parts[0], 10);
  const week = Number.parseInt(parts[1].replace("W", ""), 10);
  const date = new Date(year, 0, 1 + (week - 1) * 7);
  const start = getMonday(date);
  const end = shiftDate(start, 6);
  return {
    start: typeof start === "string" ? start : dateToString(start),
    end,
  };
}

/**
 * Assembles unified isolated standardized syntax timestamps matching expected numerical syntax properties.
 *
 * @param {Date | string} [d=new Date()] - Evaluated element contexts mapping specific times mappings.
 * @param {string} [separator=":"] - Explicit injection spacer string syntax default (standard ":").
 * @returns {string} Safely serialized isolated temporal suffix identifier syntax "HH:mm:ss" (or matching the chosen separator).
 */
export function getTimeString(d: Date | string = new Date(), separator = ":"): string {
  const dt = typeof d === "string" ? new Date(d) : d;
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  const ss = String(dt.getSeconds()).padStart(2, "0");
  return [hh, mm, ss].join(separator);
}

/**
 * Builds composite strings dedicated for local native filename suffix syntax logic handling.
 *
 * @param {Date} [d=new Date()] - Origin date elements syntax.
 * @returns {string} Evaluated representation omitting strictly unsafe numerical identifiers formatted exactly as "YYYY-MM-DD_HHmmss".
 */
export function getTimestampFilename(d: Date = new Date()): string {
  return `${dateToString(d)}_${getTimeString(d, "")}`;
}

/**
 * Wraps isolated fully structured ISO explicit temporal representations for REST protocols.
 *
 * @param {Date} [d=new Date()] - Targeted internal instances context.
 * @returns {string} Returns the full strictly formatted ISO 8601 string (e.g., "2026-03-31T14:30:00.000Z")
 */
export function getISOTimestamp(d: Date = new Date()): string {
  return d.toISOString();
}

/**
 * Pulls solely exact ISO formatting structure date matching elements explicit identifiers.
 *
 * @param {Date} [d=new Date()] - Local structure mapping bounds.
 * @returns {string} Returns only the date part of an ISO string strictly formatted as "YYYY-MM-DD" (e.g., "2026-03-31").
 */
export function getISODate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Safely parses the internal legacy absolute target parameters sequence standard in TargetProcess.
 *
 * @param {string | null | undefined} tpDate - Formatted explicit string syntax strictly requiring `/Date(ms±hhmm)/` format.
 * @returns {string} Evaluated properties output translated fully explicitly into "YYYY-MM-DD", defaults identically to "-" upon boundary failure.
 */
export function parseTpDate(tpDate: string | null | undefined): string {
  if (!tpDate) return "-";
  const match = /\/Date\((\d+)([+-])(\d{2})(\d{2})\)\//.exec(tpDate);
  if (!match) return "-";
  const ms = Number.parseInt(match[1], 10);
  const sign = match[2] === "+" ? 1 : -1;
  const tzMs =
    sign *
    (Number.parseInt(match[3], 10) * 60 + Number.parseInt(match[4], 10)) *
    60_000;
  return dateToString(new Date(ms + tzMs));
}

/**
 * Transforms standard generic numerical elements mapped onto formatted numeric decimal expressions context.
 *
 * @param {number} h - Number evaluation context elements values representing float exact duration limits (e.g., 7.7).
 * @returns {string} Fully isolated formatting elements output strictly matching "HH:MM" format (e.g., "7:42").
 */
export function hoursToHhmm(h: number): string {
  const totalMinutes = Math.round(h * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = Math.abs(totalMinutes % 60);
  return `${hh}:${String(mm).padStart(2, "0")}`;
}

/**
 * Reverse-extrapolates mapping sequences converting standardized explicit visual strings into standard parameters syntax variables.
 *
 * @param {string} hhmm - Fully isolated formatting elements explicit boundaries strictly formatted as "HH:MM" or "H:MM" (e.g., "7:42").
 * @returns {number} Standard float decimal formatting equivalents matching the given standard syntax.
 */
export function hhmmToHours(hhmm: string): number {
  if (!hhmm || !hhmm.includes(":")) return 0;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (m ?? 0) / 60;
}

/** Default since: 1 month ago from today. */
export function oneMonthAgo(): string {
  return getISOTimestamp(addMonths(new Date(), -1));
}

/**
 * Safely extracts the native "YYYY-MM" month prefix from fully structured ISO format strings.
 * 
 * @param {string} isoString - The explicit target string containing formatting bounds (e.g. "2026-03-31").
 * @returns {string} The truncated subset string precisely capturing the Month identifier, handling empty guards seamlessly.
 */
export function extractMonthStr(isoString: string): string {
  return isoString ? isoString.substring(0, 7) : "";
}

/**
 * Assembles exact start timeline parameters specifically targeting strict APIs matching UTC expectations.
 * 
 * @param {string} dateOrMonth - Standard representation properties (if "YYYY-MM", enforces "-01" start boundary).
 * @returns {string} Evaluated properties strictly appending "T00:00:00Z".
 */
export function getApiStartOfDay(dateOrMonth: string): string {
  const d = dateOrMonth.length === 7 ? `${dateOrMonth}-01` : dateOrMonth;
  return `${d}T00:00:00Z`;
}

/**
 * Bounds the final timeline marker securely mapped against internal maximum dates matching precise UTC boundary endings.
 * 
 * @param {string} dateOrMonth - Target standard visual context (automatically fetches final Day limit for just "YYYY-MM").
 * @returns {string} Terminal elements evaluating strict suffix "T23:59:59Z".
 */
export function getApiEndOfDay(dateOrMonth: string): string {
  const d = dateOrMonth.length === 7 ? lastDayOfMonth(dateOrMonth) : dateOrMonth;
  return `${d}T23:59:59Z`;
}
