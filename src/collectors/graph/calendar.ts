import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  mergeByKey,
  readMeta,
  writeMeta,
  shouldSkipMonth,
} from "../utils";
import { CalendarEventRaw } from "@shared/aggregator";
import { dateToString, currentMonthString, lastDayOfMonth } from "@shared/dates";

const CAL_DIR = path.join(process.cwd(), "data", "raw", "graph-calendar");

async function fetchMonthEvents(
  client: Client,
  month: string,
): Promise<CalendarEventRaw[]> {
  const lastDay = lastDayOfMonth(month);
  const startDateTime = `${month}-01T00:00:00Z`;
  const endDateTime = `${lastDay}T23:59:59Z`;

  const response = (await client
    .api("/me/calendarView")
    .query({ startDateTime, endDateTime })
    .select("id,subject,start,end,organizer,attendees,isOnlineMeeting,webLink")
    .orderby("start/dateTime")
    .top(2000)
    .get()) as { value: CalendarEventRaw[] };

  return response.value ?? [];
}

export async function collectGraphCalendar(
  client: Client,
  date?: string,
  force = false,
): Promise<string[]> {
  const since = process.env["COLLECT_SINCE"] ?? "2025-01-01";
  const today = dateToString();

  await fs.mkdir(CAL_DIR, { recursive: true });

  const meta = await readMeta(CAL_DIR);
  const outPaths: string[] = [];

  if (date) {
    // Single-day mode: update only the file for that month
    const month = date.slice(0, 7);
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(CAL_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      console.log(`  [Calendar] ${month}: skip`);
      return [outPath];
    }

    const response = (await client
      .api("/me/calendarView")
      .query({
        startDateTime: `${date}T00:00:00Z`,
        endDateTime: `${date}T23:59:59Z`,
      })
      .select(
        "id,subject,start,end,organizer,attendees,isOnlineMeeting,webLink",
      )
      .orderby("start/dateTime")
      .top(2000)
      .get()) as { value: CalendarEventRaw[] };

    const events = response.value ?? [];
    const merged = await mergeByKey<CalendarEventRaw>(outPath, events, "id");
    await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
    await writeMeta(CAL_DIR, month, {
      lastExtractedDate: today,
      sources: ["graph"],
    });
    return [outPath];
  }

  // Full-range mode: iterate months from COLLECT_SINCE to today
  const sinceDate = new Date(since);
  let current = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
  const now = new Date();

  while (current <= now) {
    const year = current.getFullYear();
    const mo = current.getMonth() + 1;
    const month = `${year}-${String(mo).padStart(2, "0")}`;
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(CAL_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      console.log(`  [Calendar] ${month}: skip`);
      outPaths.push(outPath);
    } else {
      try {
        const events = await fetchMonthEvents(client, month);
        const merged = await mergeByKey<CalendarEventRaw>(
          outPath,
          events,
          "id",
        );
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
        await writeMeta(CAL_DIR, month, {
          lastExtractedDate: today,
          sources: ["graph"],
        });
        outPaths.push(outPath);
        console.log(`  [Calendar] ${month}: ${events.length} eventi`);
      } catch (err) {
        console.warn(`  [Calendar] ${month}: ${(err as Error).message}`);
      }
    }

    current = new Date(year, mo, 1); // advance to next month
  }

  return outPaths;
}
