import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { readMeta, writeMeta, shouldSkipMonth } from "../../utils";
import { createLogger } from "../../logger";
import { fileURLToPath } from "node:url";

import {
    currentMonthString,
    dateToString,
    getYearMonth,
    addMonths,
    DateRange,
    startOfMonth,
    parseDateString,
} from "@shared/dates";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isMainModule =
    process.argv[1] &&
    (process.argv[1] === __filename || process.argv[1].includes("zucchetti/index"));

const log = createLogger("zucchetti");
import type { MonthData } from "@shared/zucchetti";
import { endOfDay, endOfMonth,  startOfDay } from "date-fns";
import { getJsonRawPath } from "../../json-io";
import { CONFIG } from "@shared/env-config";

const ZUCC_DIR = getJsonRawPath("zucchetti");

function runScript(scriptPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        // Use npx tsx to run the TypeScript automation script
        const proc = spawn("npx", ["tsx", scriptPath, ...args], {
            env: { ...process.env },
            shell: true, // Required for Windows to find npx
        });

        proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
        proc.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
        proc.on("close", (code) => {
            if (code !== 0) {
                reject(new Error(`Script exited with code ${code}`));
            } else {
                resolve(Buffer.concat(chunks).toString("utf-8"));
            }
        });
        proc.on("error", reject);
    });
}

function extractJson(output: string): MonthData[] {
    const startMarker = "--- START JSON ---";
    const endMarker = "--- END JSON ---";
    const start = output.indexOf(startMarker);
    const end = output.indexOf(endMarker);

    if (start === -1 || end === -1) {
        throw new Error("Marker JSON non trovati nell'output di getTimesheet.ts");
    }

    const raw = output.slice(start + startMarker.length, end).trim();
    const parsed = JSON.parse(raw);

    // If it's a single month (legacy or single-month call), wrap it in an array
    if (!Array.isArray(parsed) || (parsed.length > 0 && !parsed[0].days)) {
        // It might be a single MonthData-like object or a flat array of days
        if (Array.isArray(parsed)) {
            // It's a flat array of days (shouldn't happen with current getTimesheet.ts but for safety)
            const firstDate = parsed[0]?.date;
            if (!firstDate) return [];
            const { year, month } = getYearMonth(firstDate);
            return [
                {
                    month,
                    year,
                    header: {},
                    days: parsed,
                },
            ];
        } else {
            // It's a single MonthData-like object { header, days }
            const days = parsed.days || [];
            const firstDate = days[0]?.date;
            if (!firstDate) return [];
            const { year, month } = getYearMonth(firstDate);
            return [
                {
                    month,
                    year,
                    header: parsed.header,
                    days,
                },
            ];
        }
    }

    return parsed as MonthData[];
}

export async function collectZucchetti(range: DateRange | undefined, force = false): Promise<string[]> {
    const today = dateToString();
    await fs.mkdir(ZUCC_DIR, { recursive: true });

    const effectiveRange: DateRange = range ?? {
        start: parseDateString(CONFIG.COLLECT_SINCE),
        end: new Date(),
    };

    // Optimization: find the first month that needs collection
    const meta = await readMeta(ZUCC_DIR);

    let startMonthDate = startOfMonth(effectiveRange.start);
    const endMonthDate = endOfMonth(effectiveRange.end);

    if (!force) {
        // Skip already collected months from the beginning
        while (startMonthDate <= endMonthDate) {
            const mStr = currentMonthString(startMonthDate);
            if (shouldSkipMonth(meta[mStr], mStr, ["zucchetti"])) {
                startMonthDate = addMonths(startMonthDate, 1);
            } else {
                break;
            }
        }
    }

    if (startMonthDate > endMonthDate) {
        log.info("Tutti i mesi nell'intervallo sono gia' aggiornati. Skip.");
        return [];
    }

    const actualStart = currentMonthString(startMonthDate);
    const actualEnd = currentMonthString(endMonthDate);

    log.info(`Avvio raccolta batch: ${actualStart} -> ${actualEnd}...`);

    const scriptPath = path.join(__dirname, "getTimesheet.ts");
    const output = await runScript(scriptPath, [`--start=${actualStart}`, `--end=${actualEnd}`]);

    const results = extractJson(output);
    const outPaths: string[] = [];

    for (const item of results) {
        const monthStr = `${item.year}-${String(item.month).padStart(2, "0")}`;
        const outPath = path.join(ZUCC_DIR, `${monthStr}.json`);

        await fs.writeFile(outPath, JSON.stringify(item.days, null, 2), "utf-8");
        await writeMeta(ZUCC_DIR, monthStr, {
            lastExtractedDate: today,
            sources: ["zucchetti"],
        });
        outPaths.push(outPath);
    }

    log.info(`Raccolti ${outPaths.length} mesi.`);
    return outPaths;
}

// --- CLI entry point ---
if (isMainModule) {
    const force = process.argv.includes("--force");
    const start = process.argv.find((a) => a.startsWith("--start="))?.split("=")[1];
    const end = process.argv.find((a) => a.startsWith("--end="))?.split("=")[1];
    let date = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
    const yearArg = process.argv.find((a) => a.startsWith("--year="))?.split("=")[1];
    const monthArg = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];

    if (!date && yearArg && monthArg) {
        date = `${yearArg}-${monthArg.padStart(2, "0")}`;
    }

    let r: DateRange = { start: parseDateString(CONFIG.COLLECT_SINCE), end: new Date() };

    if (start && end) {
        r = { start: startOfDay(parseDateString(start)), end: endOfDay(parseDateString(end)) };
    } else if (date) {
        r = { start: startOfDay(parseDateString(date)), end: endOfDay(parseDateString(date)) };
    }

    collectZucchetti(r, force)
        .then(() => process.exit(0))
        .catch((err) => {
            log.error(err.message);
            process.exit(1);
        });
}
