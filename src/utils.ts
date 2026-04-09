/**
 * General-purpose utilities (pure logic, no I/O).
 * JSON I/O functions have moved to ./json-io.ts.
 */

// Re-export I/O utilities for backward compatibility
export {
    readJson,
    writeJson,
    readJsonArray,
    readText,
    mergeByKey,
    readMeta,
    writeMeta,
    type MonthMeta,
} from "./json-io";

import { lastDayOfMonth } from "@shared/dates";
import type { MonthMeta } from "./json-io";

/**
 * Returns true if the stored metadata indicates the month is fully collected
 * with the same set of sources — safe to skip re-fetching.
 */
export function shouldSkipMonth(
    stored: MonthMeta | undefined,
    month: string,
    currentSources: string[],
): boolean {
    if (!stored) return false;

    const last = lastDayOfMonth(month);
    if (stored.lastExtractedDate < last) return false;

    const storedSorted = [...stored.sources]
        .sort((a, b) => a.localeCompare(b))
        .join("|");
    const currentSorted = [...currentSources]
        .sort((a, b) => a.localeCompare(b))
        .join("|");
    return storedSorted === currentSorted;
}
