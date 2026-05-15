/**
 * Reusable Zucchetti Cartellino scraping functions.
 * Extracted from getTimesheet.ts so that both the standalone CLI collector
 * and the post-submit scrape (in updateData.ts) can share the same logic.
 */
import {
  ZucchettiDay,
  ZucchettiJustification,
  ZucchettiRequest,
  ABSENCE_KEYWORDS,
} from "@shared/zucchetti";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Frame, Page, Locator } from "playwright";
import { extractMonthStr, parseDateString, dateToString, isSameDay } from "@shared/dates";
import { getJsonRawPath, readJson, writeJson } from "../../json-io";
import { createLogger } from "../../logger";

const log = createLogger("zucchetti-scraper");
export const ZUCC_DIR = getJsonRawPath("zucchetti");

// ── Grid reload wait ──────────────────────────────────────────────────────────

/**
 * Attende che il div della griglia Cartellino completi il ciclo hidden→visible
 * che Zucchetti esegue dopo ogni reload (cambio mese, post-submit, ecc.).
 * Fallback: 3s fissi se il div non cambia visibilità entro 5s.
 */
export async function waitForCartelloReload(page: Page, timeout = 15000): Promise<void> {
  const gridDiv = page.locator('[id$="_Grid1"][class*="cartellino"]');
  await gridDiv.waitFor({ state: "hidden",  timeout: 5000   }).catch(() => {});
  await gridDiv.waitFor({ state: "visible", timeout }).catch(async () => {
    await page.waitForTimeout(3000);
  });
}

// ── Shared DOM helpers ────────────────────────────────────────────────────────

export async function waitStable(page: Page, target: Page | Frame): Promise<void> {
  await page.waitForLoadState("networkidle");
  await target.waitForSelector('select[id$="_TxtAnno"]:not([disabled])', { state: "visible", timeout: 15000 });
  await target.waitForSelector('select[id$="_TxtMese"]:not([disabled])', { state: "visible", timeout: 15000 });
  await waitForCartelloReload(page);
}

export async function findGridFrame(page: Page): Promise<Page | Frame> {
  log.info("Ricerca del frame contenente la griglia del cartellino...");
  for (const frame of page.frames()) {
    if ((await frame.locator('tr[id*="_Grid1_row"]').count()) > 0) {
      log.info(`Griglia trovata nel frame: ${frame.name() || frame.url()}`);
      return frame;
    }
  }
  log.warn("Griglia non trovata nei frames, procedo con la pagina principale.");
  return page;
}

export async function selectPeriod(
  page: Page,
  gridFrame: Page | Frame,
  year: string,
  month: string,
): Promise<void> {
  const yearSelect = gridFrame.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first();
  await yearSelect.selectOption(year);
  await waitStable(page, gridFrame);

  const monthSelect = gridFrame.locator('select[id$="_TxtMese"]').filter({ visible: true }).first();
  await monthSelect.selectOption(month);
  await waitStable(page, gridFrame);
}

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

function parseActivityText(fullText: string): { text: string; qta: string } {
  const m1 = /(.*?)\s*q\.\s*tà\s*([\d:]+)/i.exec(fullText);
  if (m1) return { text: m1[1].trim(), qta: m1[2].trim() };
  const m2 = /^([\d:]+)\s*(.*)/.exec(fullText);
  if (m2) return { qta: m2[1].trim(), text: m2[2].trim() };
  return { text: fullText, qta: "" };
}

async function parseActivityCell(cell: Locator): Promise<ActivityEntry[]> {
  const rows = await cell.locator("div.fakeRow").all();
  const activities: ActivityEntry[] = [];

  for (const rRow of rows) {
    const fullText = (await rRow.innerText()).trim().replaceAll(/\s+/g, " ");
    const statusSpan = rRow.locator("span[title]");
    const status =
      (await statusSpan.count()) > 0
        ? ((await statusSpan.first().getAttribute("title")) ?? "")
        : "";

    const { text, qta } = parseActivityText(fullText);
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
async function extractHeader(page: Page | Frame): Promise<TimesheetHeader> {
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
  const dayMatch = /^(\d+)\s+(.*)/.exec(dayStr);
  if (!dayMatch) return null;

  const dayNumber = dayMatch[1].padStart(2, "0");
  const dayOfWeek = dayMatch[2].trim();
  const formattedDate = `${header.period.year}-${header.period.month.padStart(2, "0")}-${dayNumber}`;

  const timbrature = (await cells[3].innerText()).trim().replaceAll('\n', " ");
  const giustificativi = (await parseActivityCell(
    cells[4],
  )) as ZucchettiJustification[];
  const richieste = (await parseActivityCell(cells[5])) as ZucchettiRequest[];
  const orario = (await cells[7].innerText()).trim();
  const hOrd = (await cells[8].innerText()).trim();
  const hEcc = (await cells[9].innerText()).trim();

  return {
    date: parseDateString(formattedDate),
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
export async function scrapeCartellino(
  page: Page | Frame,
): Promise<TimesheetData> {
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
  page: Page | Frame,
  targetDate: Date,
): Promise<ZucchettiDay | null> {
  const header = await extractHeader(page);
  const rows = await page.locator('tr[id*="_Grid1_row"]').all();

  // Target day number from the date string (e.g. "18" from "2026-03-18")
  const targetDayNum = targetDate.getDate().toString().padStart(2, "0");

  for (const row of rows) {
    const firstCell = await row.locator("td").first().innerText();
    const trimmed = firstCell.trim();
    // Quick check: row starts with the target day number
    if (!trimmed.startsWith(targetDayNum.replace(/^0/, ""))) continue;

    const day = await extractRow(row, header);
    if (day && isSameDay(day.date, targetDate)) return day;
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

function resolveReqMinutes(
  r: ZucchettiRequest,
  giustificativi: ZucchettiJustification[],
): number {
  const direct = timeToMinutes(r.qta ?? "");
  if (direct > 0) return direct;
  const matched = giustificativi.find((g) => g.text === r.text);
  return matched ? timeToMinutes(matched.qta) : 0;
}

/** Cross-check hOrd vs richieste/giustificativi and add warnings. */
export function validateDay(day: ZucchettiDay): ZucchettiDay {
  const hOrdMinutes = timeToMinutes(day.hOrd);
  const isAbsence = (text: string) => ABSENCE_KEYWORDS.some((kw) => text.toUpperCase().includes(kw));
  const giustificativi = day.giustificativi ?? [];
  const approvedReqs = (day.richieste ?? []).filter((r: ZucchettiRequest) => r.status === "Approvata");

  let sumReqHOrd = 0;
  for (const r of approvedReqs) {
    if (!isAbsence(r.text ?? "")) sumReqHOrd += resolveReqMinutes(r, giustificativi);
  }

  let sumGiuHOrd = 0;
  for (const g of giustificativi) {
    if (!isAbsence(g.text)) sumGiuHOrd += timeToMinutes(g.qta);
  }

  const warnings: string[] = [];

  if (sumReqHOrd > 0 && sumReqHOrd !== hOrdMinutes) {
    warnings.push(`Discrepanza: hOrd (${day.hOrd || "0:00"}) != somma richieste hOrd approvate (${minutesToStr(sumReqHOrd)})`);
  }
  if (sumGiuHOrd > 0 && sumGiuHOrd !== hOrdMinutes) {
    warnings.push(`Discrepanza: hOrd (${day.hOrd || "0:00"}) != somma giustificativi hOrd (${minutesToStr(sumGiuHOrd)})`);
  }

  const sumReqConsistency = approvedReqs
    .filter((r: ZucchettiRequest) => r.text !== "MALATTIA")
    .reduce((acc: number, r: ZucchettiRequest) => acc + resolveReqMinutes(r, giustificativi), 0);

  const sumGiuConsistency = giustificativi
    .filter((g: ZucchettiJustification) => g.text !== "MALATTIA")
    .reduce((acc: number, g: ZucchettiJustification) => acc + timeToMinutes(g.qta), 0);

  if ((sumReqConsistency > 0 || sumGiuConsistency > 0) && sumReqConsistency !== sumGiuConsistency) {
    warnings.push(`Incongruenza: Somma richieste approvate (${minutesToStr(sumReqConsistency)}) != somma giustificativi (${minutesToStr(sumGiuConsistency)}) (escluso Malattia)`);
  }

  return warnings.length > 0 ? { ...day, warnings } : day;
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
  const monthStr = extractMonthStr(date);
  const filePath = path.join(ZUCC_DIR, `${monthStr}.json`);

  const parsed = await readJson<ZucchettiDay[] | { days: ZucchettiDay[] }>(filePath, []);
  const days: ZucchettiDay[] = Array.isArray(parsed) ? parsed : (parsed.days ?? []);

  const idx = days.findIndex((d) => dateToString(d.date) === date);
  if (idx >= 0) {
    days[idx] = day;
  } else {
    days.push(day);
    days.sort((a, b) => a.date.getTime() - b.date.getTime());
  }

  await fs.mkdir(ZUCC_DIR, { recursive: true });
  await writeJson(filePath, days);
}
