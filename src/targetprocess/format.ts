import { TpTimeEntry } from "../../shared/targetprocess";
import { createLogger } from "../logger";
const logger = createLogger("formatter");

/** Normalizes a display name: trims, collapses whitespace, canonical apostrophes, NFC. */
export function normalizeName(s: string): string {
  return s.trim().replace(/\s+/g, " ").replace(/['']/g, "'").normalize("NFC");
}

/** Case-insensitive normalized equality. */
export function nameEquals(a: string, b: string): boolean {
  return normalizeName(a).toLowerCase() === normalizeName(b).toLowerCase();
}

/** Build a lookup Set of normalized lowercase names for fast membership checks. */
export function nameSet(names: Iterable<string>): Set<string> {
  return new Set([...names].map((n) => normalizeName(n).toLowerCase()));
}

/** Returns true if the normalized lowercase name is in the set. */
export function nameSetHas(set: Set<string>, name: string): boolean {
  return set.has(normalizeName(name).toLowerCase());
}

export function hasJsonFlag(): boolean {
  return process.argv.includes("--json");
}

export function printJson(data: unknown): void {
  logger.info(JSON.stringify(data, null, 2));
}

export interface ColumnDef<T> {
  header: string;
  width: number;
  value: (row: T) => string;
}

export function printTable<T>(rows: T[], columns: ColumnDef<T>[]): void {
  const header = columns.map((c) => c.header.padEnd(c.width)).join(" | ");
  const separator = "-".repeat(header.length);

  logger.info(header);
  logger.info(separator);

  rows.forEach((row) => {
    const line = columns.map((c) => c.value(row).padEnd(c.width)).join(" | ");
    logger.info(line);
  });
}

export function groupTpEntriesByTask(entries: TpTimeEntry[]): Record<number, number> {
  const map: Record<number, number> = {};
  for (const e of entries) {
    const taskId = e.Assignable?.Id;
    if (!taskId) continue;
    map[taskId] = +((map[taskId] ?? 0) + e.Spent).toFixed(1);
  }
  return map;
}

export { parseTpDate, hoursToHhmm, hhmmToHours } from "../../shared/dates";
