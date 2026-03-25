/**
 * Reusable Zucchetti Cartellino scraping functions.
 * Extracted from getTimesheet.ts so that both the standalone CLI collector
 * and the post-submit scrape (in updateData.ts) can share the same logic.
 */
import {
  ZucchettiDay,
  ZucchettiJustification,
  ZucchettiRequest,
} from "@shared/zucchetti";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Page, Locator } from "playwright";

const ZUCC_DIR = path.join(process.cwd(), "data", "raw", "zucchetti");

// ── Scraping ─────────────────────────────────────────────────────────────────

interface TimesheetHeader {
  company: string;
  employee: string;
  period: { month: string; year: string };
}

export interface TimesheetData {
  header: TimesheetHeader;
  days: ZucchettiDay[];
}

interface ActivityEntry {
  text?: string;
  qta?: string;
  status?: string;
}

async function parseActivityCell(cell: Locator): Promise<ActivityEntry[]> {
  const rows = await cell.locator("div.fakeRow").all();
  const activities: ActivityEntry[] = [];

  for (const rRow of rows) {
    const fullText = (await rRow.innerText()).trim().replaceAll(/\s+/g, " ");
    const statusSpan = rRow.locator("span[title]");
    let status = "";
    if ((await statusSpan.count()) > 0) {
      status = (await statusSpan.first().getAttribute("title")) ?? "";
    }

    let text = fullText;
    let qta = "";

    // Pattern 1: "ACTIVITY q.tà 08:00" (common in Richieste)
    const qtaMatch1 = fullText.match(/(.*?)\s*q\.\s*tà\s*([\d:]+)/i);
    // Pattern 2: "08:00ACTIVITY" (common in Giustificativi)
    const qtaMatch2 = fullText.match(/^([\d:]+)\s*(.*)/);

    if (qtaMatch1) {
      text = qtaMatch1[1].trim();
      qta = qtaMatch1[2].trim();
    } else if (qtaMatch2) {
      qta = qtaMatch2[1].trim();
      text = qtaMatch2[2].trim();
    }

    if (text || qta) {
      const activity: ActivityEntry = {};
      if (text) activity.text = text;
      if (qta) activity.qta = qta;
      if (status) activity.status = status;
      activities.push(activity);
    }
  }

  return activities;
}

/** Extract header info (company, employee, current period) from the Cartellino page. */
async function extractHeader(page: Page): Promise<TimesheetHeader> {
  const companyInfo = await page
    .locator('[id$="_LblXCompanytbl"]')
    .filter({ visible: true })
    .first()
    .innerText();
  const employeeInfo = await page
    .locator('[id$="_LblXEmploytbl"]')
    .filter({ visible: true })
    .first()
    .innerText();
  const month = await page
    .locator('select[id$="_TxtMese"]')
    .filter({ visible: true })
    .first()
    .inputValue();
  const year = await page
    .locator('select[id$="_TxtAnno"]')
    .filter({ visible: true })
    .first()
    .inputValue();

  return {
    company: companyInfo.trim(),
    employee: employeeInfo.trim(),
    period: { month, year },
  };
}

/** Extract a single row from the Cartellino grid into a ZucchettiDay. */
async function extractRow(
  row: Locator,
  header: TimesheetHeader,
): Promise<ZucchettiDay | null> {
  const cells = await row.locator("td").all();
  if (cells.length < 10) return null;

  const dayStr = (await cells[0].innerText()).trim();
  const dayMatch = dayStr.match(/^(\d+)\s+(.*)/);
  if (!dayMatch) return null;

  const dayNumber = dayMatch[1].padStart(2, "0");
  const dayOfWeek = dayMatch[2].trim();
  const formattedDate = `${header.period.year}-${header.period.month.padStart(2, "0")}-${dayNumber}`;

  const timbrature = (await cells[3].innerText()).trim().replaceAll(/\n/g, " ");
  const giustificativi = (await parseActivityCell(
    cells[4],
  )) as ZucchettiJustification[];
  const richieste = (await parseActivityCell(cells[5])) as ZucchettiRequest[];
  const orario = (await cells[7].innerText()).trim();
  const hOrd = (await cells[8].innerText()).trim();
  const hEcc = (await cells[9].innerText()).trim();

  return {
    date: formattedDate,
    dayOfWeek,
    timbrature,
    giustificativi,
    richieste,
    orario,
    hOrd,
    hEcc,
    warnings: [],
  };
}

/** Scrape the entire visible Cartellino grid. Page must already be on it. */
export async function scrapeCartellino(page: Page): Promise<TimesheetData> {
  const header = await extractHeader(page);
  const rows = await page.locator('tr[id*="_Grid1_row"]').all();
  const days: ZucchettiDay[] = [];

  for (const row of rows) {
    const day = await extractRow(row, header);
    if (day) days.push(day);
  }

  return { header, days };
}

/** Scrape a single day row from the Cartellino grid by date (YYYY-MM-DD). */
export async function scrapeSingleDay(
  page: Page,
  targetDate: string,
): Promise<ZucchettiDay | null> {
  const header = await extractHeader(page);
  const rows = await page.locator('tr[id*="_Grid1_row"]').all();

  // Target day number from the date string (e.g. "18" from "2026-03-18")
  const targetDayNum = targetDate.slice(8, 10);

  for (const row of rows) {
    const firstCell = await row.locator("td").first().innerText();
    const trimmed = firstCell.trim();
    // Quick check: row starts with the target day number
    if (!trimmed.startsWith(targetDayNum.replaceAll(/^0/, ""))) continue;

    const day = await extractRow(row, header);
    if (day && day.date === targetDate) return day;
  }

  return null;
}

// ── Validation ───────────────────────────────────────────────────────────────

function timeToMinutes(timeStr: string): number {
  if (!timeStr || !timeStr.includes(":")) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function minutesToStr(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${h}:${m.toString().padStart(2, "0")}`;
}

/** Cross-check hOrd vs richieste/giustificativi and add warnings. */
export function validateDay(day: ZucchettiDay): ZucchettiDay {
  const hOrdMinutes = timeToMinutes(day.hOrd);
  const EXCLUDED_FROM_HORD = [
    "FERIE",
    "SERVIZIO ESTERNO",
    "EX FESTIVITA'",
    "MALATTIA",
  ];

  const approvedReqs = (day.richieste ?? []).filter(
    (r: ZucchettiRequest) => r.status === "Approvata",
  );

  let sumReqHOrd = 0;
  approvedReqs.forEach((r: ZucchettiRequest) => {
    let qta = timeToMinutes(r.qta ?? "");
    if (qta === 0) {
      const match = (day.giustificativi ?? []).find(
        (g: ZucchettiJustification) => g.text === r.text,
      );
      if (match) qta = timeToMinutes(match.qta);
    }
    if (!EXCLUDED_FROM_HORD.includes(r.text ?? "")) {
      sumReqHOrd += qta;
    }
  });

  let sumGiuHOrd = 0;
  (day.giustificativi ?? []).forEach((g: ZucchettiJustification) => {
    const qta = timeToMinutes(g.qta);
    if (!EXCLUDED_FROM_HORD.includes(g.text)) {
      sumGiuHOrd += qta;
    }
  });

  const warnings: string[] = [];

  if (sumReqHOrd > 0 && sumReqHOrd !== hOrdMinutes) {
    warnings.push(
      `Discrepanza: hOrd (${day.hOrd || "0:00"}) != somma richieste hOrd approvate (${minutesToStr(sumReqHOrd)})`,
    );
  }

  if (sumGiuHOrd > 0 && sumGiuHOrd !== hOrdMinutes) {
    warnings.push(
      `Discrepanza: hOrd (${day.hOrd || "0:00"}) != somma giustificativi hOrd (${minutesToStr(sumGiuHOrd)})`,
    );
  }

  const sumReqConsistency = approvedReqs
    .filter((r: ZucchettiRequest) => r.text !== "MALATTIA")
    .reduce((acc: number, r: ZucchettiRequest) => {
      let qta = timeToMinutes(r.qta ?? "");
      if (qta === 0) {
        const match = (day.giustificativi ?? []).find(
          (g: ZucchettiJustification) => g.text === r.text,
        );
        if (match) qta = timeToMinutes(match.qta);
      }
      return acc + qta;
    }, 0);

  const sumGiuConsistency = (day.giustificativi ?? [])
    .filter((g: ZucchettiJustification) => g.text !== "MALATTIA")
    .reduce(
      (acc: number, g: ZucchettiJustification) => acc + timeToMinutes(g.qta),
      0,
    );

  if (
    (sumReqConsistency > 0 || sumGiuConsistency > 0) &&
    sumReqConsistency !== sumGiuConsistency
  ) {
    warnings.push(
      `Incongruenza: Somma richieste approvate (${minutesToStr(sumReqConsistency)}) != somma giustificativi (${minutesToStr(sumGiuConsistency)}) (escluso Malattia)`,
    );
  }

  if (warnings.length > 0) {
    return { ...day, warnings };
  }
  return day;
}

// ── Raw file patching ────────────────────────────────────────────────────────

/**
 * Patches (or inserts) a single day in the raw monthly Zucchetti JSON file.
 * Handles both flat ZucchettiDay[] and wrapped { days: [...] } formats.
 * Always writes back as flat array (consistent with collectZucchetti).
 */
export async function patchRawZucchettiFile(
  date: string,
  day: ZucchettiDay,
): Promise<void> {
  const monthStr = date.slice(0, 7);
  const filePath = path.join(ZUCC_DIR, `${monthStr}.json`);

  let days: ZucchettiDay[] = [];
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    days = Array.isArray(parsed) ? parsed : (parsed.days ?? []);
  } catch {
    // File doesn't exist yet — will create
  }

  const idx = days.findIndex((d) => d.date === date);
  if (idx >= 0) {
    days[idx] = day;
  } else {
    days.push(day);
    days.sort((a, b) => a.date.localeCompare(b.date));
  }

  await fs.mkdir(ZUCC_DIR, { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(days, null, 2), "utf-8");
}
