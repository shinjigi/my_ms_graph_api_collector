import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Client } from "@microsoft/microsoft-graph-client";
import { Event} from "@microsoft/microsoft-graph-types";

import { createLogger } from "../../logger";

const log = createLogger("graph-calendar");
import { mergeByKey, readMeta, writeMeta, shouldSkipMonth, writeJson } from "../../utils";
import { CalendarEventRaw, mapToLeanEvent } from "@shared/graph";
import {
  dateToString,
  currentMonthString,
  startOfMonth,
  addMonths,
  getApiStartOfDay,
  getApiEndOfDay,
  extractMonthStr,
} from "@shared/dates";
import { GraphResponse } from "@shared/graph";

const CAL_DIR = path.join(process.cwd(), "data", "raw", "graph-calendar");


async function fetchCalendarEvents(
  client: Client,
  apiPath: string,
  query: Record<string, string | number> = {},
): Promise<Event[]> {
  const events: Event[] = [];
  let nextLink: string | null = null;
  let pageNum = 1;

  do {
    const request = nextLink
      ? client.api(nextLink)
      : client.api(apiPath).query(query);
    const response = (await request
      .select(
        "id,subject,start,end,organizer,attendees,isOnlineMeeting,webLink,body,bodyPreview",
      )
      .orderby("start/dateTime")
      .top(100) // Page size
      .get()) as GraphResponse<Event>;

    const page = response.value ?? [];
    events.push(...page);

    if (pageNum > 1 || response["@odata.nextLink"]) {
      log.info(
        `    [Pagina ${pageNum++}] Scaricati ${page.length} eventi. Totale: ${events.length}`,
      );
    }

    nextLink = response["@odata.nextLink"] ?? null;
  } while (nextLink);

  return events;
}

async function fetchMonthEvents(
  client: Client,
  month: string,
): Promise<CalendarEventRaw[]> {
  const events = await fetchCalendarEvents(client, "/me/calendarView", {
    startDateTime: getApiStartOfDay(month),
    endDateTime: getApiEndOfDay(month),
  });
  return events.map(mapToLeanEvent);
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
    const month = extractMonthStr(date);
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(CAL_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      log.info(`  [Calendar] ${month}: skip`);
      return [outPath];
    }

    const rawEvents = await fetchCalendarEvents(client, "/me/calendarView", {
      startDateTime: getApiStartOfDay(date),
      endDateTime: getApiEndOfDay(date),
    });
    const events = rawEvents.map(mapToLeanEvent);

    const merged = await mergeByKey<CalendarEventRaw>(outPath, events, "id");
    await writeJson(outPath, merged);
    await writeMeta(CAL_DIR, month, {
      lastExtractedDate: today,
      sources: ["graph"],
    });
    return [outPath];
  }

  // Full-range mode: iterate months from COLLECT_SINCE to today
  let current = startOfMonth(since);
  const now = new Date();

  while (current <= now) {
    const month = currentMonthString(current);
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(CAL_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      log.info(`  [Calendar] ${month}: skip`);
      outPaths.push(outPath);
    } else {
      try {
        const events = await fetchMonthEvents(client, month);
        const merged = await mergeByKey<CalendarEventRaw>(
          outPath,
          events,
          "id",
        );
        await writeJson(outPath, merged);
        await writeMeta(CAL_DIR, month, {
          lastExtractedDate: today,
          sources: ["graph"],
        });
        outPaths.push(outPath);
        log.info(`  [Calendar] ${month}: ${events.length} eventi`);
      } catch (err) {
        log.warn(`  [Calendar] ${month}: ${(err as Error).message}`);
      }
    }

    current = addMonths(current, 1); // advance to next month
  }

  return outPaths;
}
