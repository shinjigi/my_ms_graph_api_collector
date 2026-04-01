/**
 * Week data route: serves aggregated Zucchetti and TP hours for a given week.
 * GET /api/week/:date           → full week context (Mon-Sun)
 * GET /api/week/:date/tp-hours  → TP time entries for the week
 */
import { Router, Request, Response } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TargetprocessClient } from "../../targetprocess/client";
import { parseTpDate, hhmmToHours } from "../../targetprocess/format";
import { WeekDayData, ApiWeekResponse } from "@shared/week";
import type { SubmitEdit } from "@shared/submit";
import { ZucchettiDay, isWorkday, parseZucchettiLocation } from "@shared/zucchetti";
import { findHoliday } from "@shared/holidays";
import { AggregatedDay, NibolBooking } from "@shared/aggregator";
import { readMeta } from "../../utils";
import { WORKDAY_HOURS } from "@shared/standards";

export const weekRouter = Router();

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const AGG_DIR = path.join(process.cwd(), "data", "aggregated");

import { TpWeekEntry, TpWeekResponse } from "@shared/targetprocess";

import {
  dateToString,
  currentMonthString,
  getMonday,
  shiftDate,
  parseDateString,
} from "../../../shared/dates";

async function readAggregatedDay(date: string): Promise<AggregatedDay | null> {
  const filePath = path.join(AGG_DIR, `${date}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as AggregatedDay;
  } catch {
    return null;
  }
}

async function loadZucchettiMonth(month: string): Promise<ZucchettiDay[]> {
  const filePath = path.join(RAW_DIR, "zucchetti", `${month}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    // Handle both flat ZucchettiDay[] and wrapped { days: [...] } formats
    return Array.isArray(parsed) ? parsed : (parsed.days ?? []);
  } catch {
    return [];
  }
}

/** Returns bookings scraped for the month, or null if the raw file does not exist. */
async function loadNibolMonth(month: string): Promise<NibolBooking[] | null> {
  const filePath = path.join(RAW_DIR, "nibol", `${month}.json`);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as NibolBooking[];
  } catch {
    return null; // file absent → not scraped
  }
}



// GET /api/week/:date
weekRouter.get("/:date", async (req: Request, res: Response) => {
  const dateStr = req.params.date as string;
  const monday = getMonday(dateStr);

  const weekDays: WeekDayData[] = [];
  const monthsToLoad = new Set<string>();

  // Plan which Zucchetti months to load
  for (let i = 0; i < 7; i++) {
    monthsToLoad.add(currentMonthString(shiftDate(monday, i)));
  }

  // Load raw Zucchetti data as fallback for days without aggregated files
  const zuccAll: ZucchettiDay[] = [];
  // Load raw Nibol data: track scraping coverage via meta lastExtractedDate
  const nibolDir = path.join(RAW_DIR, "nibol");
  const nibolMeta = await readMeta(nibolDir);
  const nibolByDate = new Map<string, NibolBooking>();
  for (const month of monthsToLoad) {
    const zuccDays = await loadZucchettiMonth(month);
    zuccAll.push(...zuccDays);
    const nibolBookings = await loadNibolMonth(month);
    if (nibolBookings !== null) {
      for (const b of nibolBookings) nibolByDate.set(b.date, b);
    }
  }

  // Build 7-day week response
  for (let i = 0; i < 7; i++) {
    const dateStr = shiftDate(monday, i);
    const d = parseDateString(dateStr);

    // Aggregated file is the primary source — already contains isWorkday, oreTarget, location
    const agg = await readAggregatedDay(dateStr);

    // Fall back to raw Zucchetti for days without an aggregated file
    const zuccDay: ZucchettiDay | null =
      agg?.zucchetti ?? zuccAll.find((z) => z.date === dateStr) ?? null;

    // Default: weekdays (Mon-Fri) are workdays; only override if we have Zucchetti evidence
    const dow = d.getDay(); // 0=Sun, 6=Sat
    const isWeekday = dow >= 1 && dow <= 5;
    const holiday = findHoliday(d);
    const isWd =
      agg?.isWorkday ?? (zuccDay ? isWorkday(zuccDay) : isWeekday && !holiday);
    const rawOre = zuccDay?.hOrd ? hhmmToHours(zuccDay.hOrd) : null;
    const oreTarget = agg?.oreTarget ?? (isWd ? (rawOre ?? WORKDAY_HOURS) : 0);
    // Location: Nibol is the primary source (desk booking is authoritative).
    const monthStr = currentMonthString(dateStr);
    const nibolLastScraped = nibolMeta[monthStr]?.lastExtractedDate ?? null;
    const nibolDayScraped =
      nibolLastScraped !== null && dateStr <= nibolLastScraped;
    const nibolBooking =
      nibolByDate.get(dateStr) ??
      (nibolDayScraped ? (agg?.nibol ?? null) : null);

    let location: WeekDayData["location"] = "unknown";
    if (nibolBooking) {
      const t = nibolBooking.type.toLowerCase();
      location = t === "remote" || t === "home" ? "smart" : "office";
    } else if (zuccDay) {
      const zLoc = parseZucchettiLocation(zuccDay);
      // If we have explicit signals (smart/travel/external), use them.
      // If Zucchetti says 'office' (no signals), but Nibol was scraped with no booking,
      // revert to 'unknown' to be conservative (might be an undeclared absence).
      if (zLoc === "office" && nibolDayScraped) {
        location = "unknown";
      } else {
        location = zLoc;
      }
    } else if (nibolDayScraped) {
      location = "unknown";
    }

    const dayData: WeekDayData = {
      date: dateStr,
      isWorkday: isWd,
      oreTarget,
      location,
      nibol: agg?.nibol ?? null,
      holiday: !isWd,
      holidayName: holiday?.name,
      zucchetti: zuccDay,
      calendar: agg?.calendar ?? [],
      emails: agg?.emails ?? [],
      teams: agg?.teams ?? [],
      svnCommits: agg?.svnCommits ?? [],
      gitCommits: agg?.gitCommits ?? [],
      browserVisits: agg?.browserVisits ?? [],
    };

    weekDays.push(dayData);
  }

  const response: ApiWeekResponse = {
    monday: dateToString(monday),
    days: weekDays,
  };

  res.json(response);
});

// GET /api/week/:date/tp-hours
weekRouter.get("/:date/tp-hours", async (req: Request, res: Response) => {
  try {
    const dateStr = req.params.date as string;
    const monday = getMonday(dateStr);
    const mondayStr = dateToString(monday);
    const fridayStr = shiftDate(monday, 4);

    const tpClient = new TargetprocessClient();
    const me = await tpClient.getMe();

    const [timeEntries, openItems] = await Promise.all([
      tpClient.getTimesByUserAndDateRange(me.Id, mondayStr, fridayStr),
      tpClient.getMyAssignedOpenItems(),
    ]);

    // Group time entries by assignable ID and day index
    const entriesByAssignable = new Map<number, Map<number, number>>();
    const notesByAssignable = new Map<number, Map<number, string[]>>();

    for (const entry of timeEntries) {
      const entryDate = parseTpDate(entry.Date);
      if (entryDate === "-") continue;

      const d = new Date(entryDate);
      const dow = d.getDay();
      const dayIndex = dow === 0 ? 6 : dow - 1;

      if (dayIndex < 0 || dayIndex > 4) continue;

      const tpId = entry.Assignable?.Id;
      if (!tpId) continue;

      if (!entriesByAssignable.has(tpId)) {
        entriesByAssignable.set(tpId, new Map());
        notesByAssignable.set(tpId, new Map());
      }
      const dayMap = entriesByAssignable.get(tpId)!;
      const noteMap = notesByAssignable.get(tpId)!;
      dayMap.set(dayIndex, (dayMap.get(dayIndex) ?? 0) + entry.Spent);

      if (entry.Description) {
        const existing = noteMap.get(dayIndex) ?? [];
        existing.push(entry.Description);
        noteMap.set(dayIndex, existing);
      }
    }

    // Build metadata map — openItems first (has state, project, timeSpent)
    const metaMap = new Map<
      number,
      {
        name: string;
        stateName: string;
        projectName: string;
        timeSpent: number;
      }
    >();
    for (const item of openItems) {
      metaMap.set(item.id, {
        name: item.name,
        stateName: item.stateName,
        projectName: item.projectName,
        timeSpent: item.timeSpent,
      });
    }
    // Enrich with Assignable data from time entries for closed items not in openItems
    for (const entry of timeEntries) {
      const asgn = entry.Assignable;
      if (!asgn || metaMap.has(asgn.Id)) continue;
      metaMap.set(asgn.Id, {
        name: asgn.Name,
        stateName: asgn.EntityState?.Name ?? "",
        projectName: asgn.Project?.Name ?? "",
        timeSpent: 0,
      });
    }

    // Build entries array:
    //  1. All open items (always shown in active section for logging)
    //  2. Closed items that have time entries this week (so past logs remain visible)
    const entries: TpWeekEntry[] = [];
    const openIds = new Set(openItems.map((i) => i.id));

    for (const item of openItems) {
      const dayHoursMap = entriesByAssignable.get(item.id);
      const dayNoteMap = notesByAssignable.get(item.id);
      const hours = [0, 1, 2, 3, 4].map(
        (i) => +(dayHoursMap?.get(i) ?? 0).toFixed(2),
      );
      const notes: Array<string | null> = [0, 1, 2, 3, 4].map(
        (i) => dayNoteMap?.get(i)?.join(" | ") ?? null,
      );
      entries.push({
        tpId: item.id,
        usName: item.name,
        stateName: item.stateName,
        timeSpent: item.timeSpent,
        projectName: item.projectName,
        hours,
        notes,
      });
    }

    // Closed items with hours this week (not in openItems)
    for (const [tpId, dayHoursMap] of entriesByAssignable) {
      if (openIds.has(tpId)) continue;
      const dayNoteMap = notesByAssignable.get(tpId);
      const meta = metaMap.get(tpId) ?? {
        name: `TP #${tpId}`,
        stateName: "",
        projectName: "",
        timeSpent: 0,
      };
      const hours = [0, 1, 2, 3, 4].map(
        (i) => +(dayHoursMap.get(i) ?? 0).toFixed(2),
      );
      const notes: Array<string | null> = [0, 1, 2, 3, 4].map(
        (i) => dayNoteMap?.get(i)?.join(" | ") ?? null,
      );
      entries.push({
        tpId,
        usName: meta.name,
        stateName: meta.stateName,
        timeSpent: meta.timeSpent,
        projectName: meta.projectName,
        hours,
        notes,
      });
    }

    const response: TpWeekResponse = {
      userId: me.Id,
      userName: me.FullName,
      entries,
      openItems,
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// POST /api/week/:date/submit  — bulk log hoursEdits to TargetProcess
weekRouter.post("/:date/submit", async (req: Request, res: Response) => {
  try {
    const body = req.body as { edits?: SubmitEdit[] };
    if (!Array.isArray(body.edits)) {
      res.status(400).json({ error: "edits array required" });
      return;
    }

    const tpClient = new TargetprocessClient();
    const submitted: unknown[] = [];
    const errors: Array<{ tpId: number; date: string; error: string }> = [];

    for (const edit of body.edits) {
      if (!edit.tpId || !edit.date || edit.hours <= 0) continue;
      try {
        const result = await tpClient.logTime({
          usId: edit.tpId,
          spent: edit.hours,
          date: edit.date,
          description: edit.description || "",
        });
        submitted.push(result);
      } catch (err) {
        errors.push({
          tpId: edit.tpId,
          date: edit.date,
          error: (err as Error).message,
        });
      }
    }

    res.json({ submitted: submitted.length, errors });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
