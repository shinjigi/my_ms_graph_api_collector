/**
 * Centralized JSON I/O utilities for the backend.
 * All functions are async (fs/promises). All writes use 2-space indentation.
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

// ─── Core read/write ───────────────────────────────────────────────

/** Read and parse a JSON file. Returns fallback on missing or invalid file. */
export async function readJson<T>(filePath: string, fallback: T): Promise<T> {
    try {
        const raw = await fs.readFile(filePath, "utf-8");
        return JSON.parse(raw) as T;
    } catch {
        return fallback;
    }
}

/** Write an object as pretty-printed JSON (2-space indent, utf-8). */
export async function writeJson(
    filePath: string,
    data: unknown,
): Promise<void> {
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/** Read a JSON file expected to contain an array. Returns [] on missing or invalid. */
export async function readJsonArray<T>(filePath: string): Promise<T[]> {
    try {
        const raw = await fs.readFile(filePath, "utf-8");
        const data = JSON.parse(raw);
        return Array.isArray(data) ? (data as T[]) : [];
    } catch {
        return [];
    }
}

/** Read a text file (e.g. .md). Returns null on missing or empty. */
export async function readText(filePath: string): Promise<string | null> {
    try {
        const content = (await fs.readFile(filePath, "utf-8")).trim();
        return content || null;
    } catch {
        return null;
    }
}

// ─── Merge-dedup ───────────────────────────────────────────────────

/** Reads existing JSON array file, merges new items by key (dedup), returns merged array. */
export async function mergeByKey<T>(
    filePath: string,
    newItems: T[],
    key: keyof T,
): Promise<T[]> {
    const existing = await readJsonArray<T>(filePath);
    const map = new Map<unknown, T>();
    for (const item of existing) map.set(item[key], item);
    for (const item of newItems) map.set(item[key], item);
    return Array.from(map.values());
}

// ─── Meta sidecar (.meta.json) ─────────────────────────────────────

export interface MonthMeta {
    lastExtractedDate: string; // YYYY-MM-DD
    sources: string[];         // paths/URLs actually scanned for that month
    activeDays?: string[];     // YYYY-MM-DD — days found inside this file/month
}

/** Read `.meta.json` sidecar for a directory. */
export async function readMeta(
    dir: string,
): Promise<Record<string, MonthMeta>> {
    return readJson(path.join(dir, ".meta.json"), {});
}

/** Write (merge) a single entry into the `.meta.json` sidecar. */
export async function writeMeta(
    dir: string,
    key: string,
    meta: MonthMeta,
): Promise<void> {
    const existing = await readMeta(dir);
    existing[key] = meta;
    await writeJson(path.join(dir, ".meta.json"), existing);
}
