/**
 * Sync route: triggers targeted data collection and re-aggregation for a
 * single day or a full week.
 *
 * POST /api/sync
 *   Body: { scope: "day" | "week"; date: string; force?: boolean }
 *
 * Only Zucchetti and Nibol collectors are invoked — they are the two sources
 * that directly influence location data and daily work-hour tracking.
 * Graph API / VCS / Browser collectors require separate auth flows and are
 * excluded from on-demand sync.
 */
import { Router, Request, Response } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { collectZucchetti } from "../../collectors/zucchetti/index";
import { collectNibol } from "../../collectors/nibol/index";
import { aggregateSingleDay } from "../../aggregators/aggregator";
import { readMeta } from "../../utils";
import { ZucchettiDay } from "@shared/zucchetti";
import { getMonday, shiftDate, currentMonthString } from "@shared/dates";

export const syncRouter = Router();

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const ZUCC_DIR = path.join(RAW_DIR, "zucchetti");
const NIBOL_DIR = path.join(RAW_DIR, "nibol");

interface SyncRequest {
  scope: "day" | "week";
  date: string;
  force?: boolean;
}

interface SyncResponse {
  synced: string[]; // collectors that were actually run
  skipped: string[]; // collectors that were up-to-date
  aggregated: string[]; // dates successfully re-aggregated
  errors: string[];
}

/** Reads a Zucchetti monthly raw file and returns its day entries. */
async function loadZucchettiMonth(month: string): Promise<ZucchettiDay[]> {
  const filePath = path.join(ZUCC_DIR, `${month}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.days ?? []);
  } catch {
    return [];
  }
}

/**
 * Returns true if meta indicates the given dates are already covered for the
 * source directory (i.e. lastExtractedDate >= every date in the list and
 * the month file exists).
 */
async function isUpToDate(dir: string, dates: string[]): Promise<boolean> {
  const meta = await readMeta(dir);
  for (const date of dates) {
    const month = currentMonthString(date);
    const last = meta[month]?.lastExtractedDate ?? null;
    if (last === null || last < date) return false;
  }
  return true;
}

// POST /api/sync
syncRouter.post("/", async (req: Request, res: Response) => {
  const { scope, date, force = false } = req.body as SyncRequest;

  if (!scope || !date) {
    res.status(400).json({ error: "scope and date are required" });
    return;
  }

  // Build the list of target dates
  const dates: string[] = [];
  if (scope === "day") {
    dates.push(date);
  } else {
    const monday = getMonday(date);
    for (let i = 0; i < 5; i++) {
      dates.push(shiftDate(monday, i));
    }
  }

  const rangeStart = dates[0];
  const rangeEnd = dates[dates.length - 1];

  const result: SyncResponse = {
    synced: [],
    skipped: [],
    aggregated: [],
    errors: [],
  };

  // --- Zucchetti ---
  try {
    const zucUpToDate = !force && (await isUpToDate(ZUCC_DIR, dates));
    if (zucUpToDate) {
      result.skipped.push("zucchetti");
    } else {
      await collectZucchetti(force, { start: rangeStart, end: rangeEnd });
      result.synced.push("zucchetti");
    }
  } catch (err) {
    result.errors.push(`zucchetti: ${(err as Error).message}`);
  }

  // --- Nibol ---
  try {
    const nibolUpToDate = !force && (await isUpToDate(NIBOL_DIR, dates));
    if (nibolUpToDate) {
      result.skipped.push("nibol");
    } else {
      await collectNibol(force, { start: rangeStart, end: rangeEnd });
      result.synced.push("nibol");
    }
  } catch (err) {
    result.errors.push(`nibol: ${(err as Error).message}`);
  }

  // --- Re-aggregate each date ---
  for (const d of dates) {
    try {
      const month = currentMonthString(d);
      const zDays = await loadZucchettiMonth(month);
      const zDay = zDays.find((z) => z.date === d);
      if (!zDay) {
        result.errors.push(`aggregation: no Zucchetti data for ${d}`);
        continue;
      }
      await aggregateSingleDay(d, zDay);
      result.aggregated.push(d);
    } catch (err) {
      result.errors.push(`aggregation ${d}: ${(err as Error).message}`);
    }
  }

  res.json(result);
});
