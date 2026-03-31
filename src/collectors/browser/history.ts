import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { createRequire } from "node:module";
import { mergeByKey, readMeta, writeMeta, shouldSkipMonth } from "../utils";
import { BrowserVisit } from "@shared/aggregator";
import { dateToString, currentMonthString, getISOTimestamp } from "@shared/dates";

const _require = createRequire(__filename);

const CHROME_DIR = path.join(process.cwd(), "data", "raw", "browser-chrome");
const FIREFOX_DIR = path.join(process.cwd(), "data", "raw", "browser-firefox");

// Offset between Windows FILETIME epoch (Jan 1, 1601) and Unix epoch (Jan 1, 1970) in microseconds
const CHROME_EPOCH_OFFSET_US = BigInt(11_644_473_600) * BigInt(1_000_000);

type SqlJsStatic = import("sql.js").SqlJsStatic;

type Database = import("sql.js").Database;

async function loadSqlJs(): Promise<SqlJsStatic> {
  const initSqlJs = _require("sql.js") as (opts?: {
    locateFile?: (f: string) => string;
  }) => Promise<SqlJsStatic>;
  return initSqlJs({
    locateFile: (f: string) =>
      path.join(path.dirname(_require.resolve("sql.js")), f),
  });
}

/** Copy a SQLite file to a temp path to avoid browser file locks. */
async function copyToTemp(srcPath: string): Promise<string> {
  const tmpPath = path.join(
    os.tmpdir(),
    `sqlite-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
  await fs.copyFile(srcPath, tmpPath);
  return tmpPath;
}

function chromeTimeToIso(chromeUs: bigint): string {
  // Chrome stores timestamps as microseconds since Jan 1, 1601 (Windows FILETIME)
  const unixMs = Number((chromeUs - CHROME_EPOCH_OFFSET_US) / BigInt(1000));
  return getISOTimestamp(new Date(unixMs));
}

function firefoxTimeToIso(firefoxUs: bigint): string {
  // Firefox stores timestamps as microseconds since Unix epoch
  const unixMs = Number(firefoxUs / BigInt(1000));
  return getISOTimestamp(new Date(unixMs));
}

async function queryChromeProfile(
  SQL: SqlJsStatic,
  profileDir: string,
  sourceName: string,
  sinceMs: bigint, // Unix microseconds
): Promise<BrowserVisit[]> {
  const historyPath = path.join(profileDir, "History");
  let tmpPath: string | null = null;

  try {
    await fs.access(historyPath);
  } catch {
    return []; // Profile not present or History file missing
  }

  try {
    tmpPath = await copyToTemp(historyPath);
    const fileBuffer = await fs.readFile(tmpPath);
    const db: Database = new SQL.Database(fileBuffer);

    // Chrome epoch offset in Chrome microseconds from its own epoch
    const chromeSince = sinceMs + CHROME_EPOCH_OFFSET_US;

    const results = db.exec(
      `SELECT v.id, u.url, u.title, v.visit_time
             FROM visits v JOIN urls u ON v.url = u.id
             WHERE v.visit_time >= ${chromeSince.toString()}`,
    );

    db.close();

    if (!results[0]) return [];

    return results[0].values.map((row) => {
      const [id, url, title, visitTime] = row as [
        number,
        string,
        string | null,
        bigint,
      ];
      const isoTime = chromeTimeToIso(BigInt(visitTime as unknown as string));
      return {
        visitId: `${sourceName}-${id}`,
        source: sourceName,
        url: url ?? "",
        title: title ?? null,
        visitTime: isoTime,
        date: dateToString(isoTime),
      };
    });
  } finally {
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => undefined);
    }
  }
}

async function queryFirefoxProfile(
  SQL: SqlJsStatic,
  profileDir: string,
  sourceName: string,
  sinceMs: bigint, // Unix microseconds
): Promise<BrowserVisit[]> {
  const dbPath = path.join(profileDir, "places.sqlite");
  let tmpPath: string | null = null;

  try {
    await fs.access(dbPath);
  } catch {
    return []; // Profile not present
  }

  try {
    tmpPath = await copyToTemp(dbPath);
    const fileBuffer = await fs.readFile(tmpPath);
    const db: Database = new SQL.Database(fileBuffer);

    const results = db.exec(
      `SELECT v.id, p.url, p.title,
                    v.visit_date
             FROM moz_historyvisits v JOIN moz_places p ON v.place_id = p.id
             WHERE v.visit_date >= ${sinceMs.toString()}`,
    );

    db.close();

    if (!results[0]) return [];

    return results[0].values.map((row) => {
      const [id, url, title, visitDate] = row as [
        number,
        string,
        string | null,
        bigint,
      ];
      const isoTime = firefoxTimeToIso(BigInt(visitDate as unknown as string));
      return {
        visitId: `${sourceName}-${id}`,
        source: sourceName,
        url: url ?? "",
        title: title ?? null,
        visitTime: isoTime,
        date: dateToString(isoTime),
      };
    });
  } finally {
    if (tmpPath) {
      await fs.unlink(tmpPath).catch(() => undefined);
    }
  }
}

async function writeByMonth(
  dir: string,
  visits: BrowserVisit[],
  sources: string[],
  force: boolean,
): Promise<string[]> {
  const meta = await readMeta(dir);
  const today = dateToString();
  const outPaths: string[] = [];

  // Group visits by month
  const byMonth = new Map<string, BrowserVisit[]>();
  for (const v of visits) {
    const month = currentMonthString(v.date);
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(v);
  }

  const months = Array.from(byMonth.keys()).sort((a, b) => a.localeCompare(b));

  for (const month of months) {
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(dir, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, sources)
    ) {
      outPaths.push(outPath);
      continue;
    }

    const newVisits = byMonth.get(month) ?? [];
    const merged = await mergeByKey<BrowserVisit>(
      outPath,
      newVisits,
      "visitId",
    );
    await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
    await writeMeta(dir, month, { lastExtractedDate: today, sources });
    outPaths.push(outPath);
  }

  return outPaths;
}

export async function collectBrowserHistory(force = false): Promise<string[]> {
  const chromeProfileDirs = (process.env["CHROME_PROFILE_DIRS"] ?? "")
    .split(";")
    .map((p) => p.trim())
    .filter(Boolean);
  const firefoxProfileDir = (process.env["FIREFOX_PROFILE_DIR"] ?? "").trim();

  const since = process.env["COLLECT_SINCE"] ?? "2025-01-01";
  const sinceMs = BigInt(Date.parse(since)) * BigInt(1000); // Unix microseconds

  if (chromeProfileDirs.length === 0 && !firefoxProfileDir) {
    console.warn(
      "CHROME_PROFILE_DIRS e FIREFOX_PROFILE_DIR non configurati — collector browser saltato.",
    );
    return [];
  }

  let SQL: SqlJsStatic;
  try {
    SQL = await loadSqlJs();
  } catch (err) {
    console.warn(
      `Browser history: impossibile caricare sql.js — ${(err as Error).message}`,
    );
    return [];
  }

  await fs.mkdir(CHROME_DIR, { recursive: true });
  await fs.mkdir(FIREFOX_DIR, { recursive: true });

  const outPaths: string[] = [];

  // --- Chrome ---
  if (chromeProfileDirs.length > 0) {
    const allChromeVisits: BrowserVisit[] = [];

    for (let i = 0; i < chromeProfileDirs.length; i++) {
      const profileDir = chromeProfileDirs[i];
      const sourceName = `chrome-profile${i + 1}`;
      try {
        const visits = await queryChromeProfile(
          SQL,
          profileDir,
          sourceName,
          sinceMs,
        );
        allChromeVisits.push(...visits);
        console.log(
          `  [Browser] Chrome ${sourceName}: ${visits.length} visite`,
        );
      } catch (err) {
        console.warn(
          `  [Browser] Chrome ${sourceName}: ${(err as Error).message}`,
        );
      }
    }

    const chromePaths = await writeByMonth(
      CHROME_DIR,
      allChromeVisits,
      chromeProfileDirs,
      force,
    );
    outPaths.push(...chromePaths);
  }

  // --- Firefox ---
  if (firefoxProfileDir) {
    try {
      const visits = await queryFirefoxProfile(
        SQL,
        firefoxProfileDir,
        "firefox",
        sinceMs,
      );
      console.log(`  [Browser] Firefox: ${visits.length} visite`);
      const firefoxPaths = await writeByMonth(
        FIREFOX_DIR,
        visits,
        [firefoxProfileDir],
        force,
      );
      outPaths.push(...firefoxPaths);
    } catch (err) {
      console.warn(`  [Browser] Firefox: ${(err as Error).message}`);
    }
  }

  return outPaths;
}
