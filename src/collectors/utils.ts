import * as fs   from 'fs/promises';
import * as path from 'path';

export interface MonthMeta {
    lastExtractedDate: string;   // YYYY-MM-DD
    sources:           string[]; // paths/URLs actually scanned for that month
}

/** Merge-dedup: reads existing file, overwrites items by key, returns merged array. */
export async function mergeByKey<T>(filePath: string, newItems: T[], key: keyof T): Promise<T[]> {
    let existing: T[] = [];
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        existing  = JSON.parse(raw) as T[];
    } catch {
        // File does not exist yet — start empty
    }

    const map = new Map<unknown, T>();
    for (const item of existing)  map.set(item[key], item);
    for (const item of newItems)  map.set(item[key], item);

    return Array.from(map.values());
}

/** Read `.meta.json` sidecar for a directory. */
export async function readMeta(dir: string): Promise<Record<string, MonthMeta>> {
    try {
        const raw = await fs.readFile(path.join(dir, '.meta.json'), 'utf-8');
        return JSON.parse(raw) as Record<string, MonthMeta>;
    } catch {
        return {};
    }
}

/** Write (merge) a single month entry into the `.meta.json` sidecar. */
export async function writeMeta(dir: string, month: string, meta: MonthMeta): Promise<void> {
    const existing   = await readMeta(dir);
    existing[month]  = meta;
    await fs.writeFile(path.join(dir, '.meta.json'), JSON.stringify(existing, null, 2), 'utf-8');
}

/** Returns the last day of a month as "YYYY-MM-DD". */
export function lastDayOfMonth(month: string): string {
    const [y, m] = month.split('-').map(Number);
    // Use UTC to avoid timezone offset shifting the result to the previous day
    return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/**
 * Returns true if the stored metadata indicates the month is fully collected
 * with the same set of sources — safe to skip re-fetching.
 */
export function shouldSkipMonth(
    stored:         MonthMeta | undefined,
    month:          string,
    currentSources: string[],
): boolean {
    if (!stored) return false;

    const last = lastDayOfMonth(month);
    if (stored.lastExtractedDate < last) return false;

    const storedSorted  = [...stored.sources].sort().join('|');
    const currentSorted = [...currentSources].sort().join('|');
    return storedSorted === currentSorted;
}
