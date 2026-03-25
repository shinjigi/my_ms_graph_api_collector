import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { readMeta, writeMeta, shouldSkipMonth } from "../utils";
import { createLogger } from "../../logger";

const log = createLogger("zucchetti");
import type { MonthData } from "@shared/zucchetti";

const ZUCC_DIR = path.join(process.cwd(), "data", "raw", "zucchetti");

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
      const [y, m] = firstDate.split("-");
      return [
        {
          month: Number.parseInt(m, 10),
          year: Number.parseInt(y, 10),
          header: {},
          days: parsed,
        },
      ];
    } else {
      // It's a single MonthData-like object { header, days }
      const days = parsed.days || [];
      const firstDate = days[0]?.date;
      if (!firstDate) return [];
      const [y, m] = firstDate.split("-");
      return [
        {
          month: Number.parseInt(m, 10),
          year: Number.parseInt(y, 10),
          header: parsed.header,
          days,
        },
      ];
    }
  }

  return parsed as MonthData[];
}

export async function collectZucchetti(
  force = false,
  range?: { start: string; end: string },
): Promise<string[]> {
  const sinceStr = range?.start || process.env["COLLECT_SINCE"] || "2025-01-01";
  const endStr = range?.end || new Date().toISOString().slice(0, 7); // Default to current month YYYY-MM

  const today = new Date().toISOString().slice(0, 10);
  await fs.mkdir(ZUCC_DIR, { recursive: true });

  // Optimization: find the first month that needs collection
  const meta = await readMeta(ZUCC_DIR);

  const startMonthDate = new Date(
    sinceStr.length === 7 ? `${sinceStr}-01` : sinceStr,
  );
  const endMonthDate = new Date(endStr.length === 7 ? `${endStr}-01` : endStr);

  if (!force) {
    // Skip already collected months from the beginning
    while (startMonthDate <= endMonthDate) {
      const mStr = startMonthDate.toISOString().slice(0, 7);
      if (shouldSkipMonth(meta[mStr], mStr, ["zucchetti"])) {
        startMonthDate.setMonth(startMonthDate.getMonth() + 1);
      } else {
        break;
      }
    }
  }

  if (startMonthDate > endMonthDate) {
    log.info("Tutti i mesi nell'intervallo sono gia' aggiornati. Skip.");
    return [];
  }

  const actualStart = startMonthDate.toISOString().slice(0, 7);
  const actualEnd = endMonthDate.toISOString().slice(0, 7);

  log.info(`Avvio raccolta batch: ${actualStart} -> ${actualEnd}...`);

  const scriptPath = path.join(__dirname, "getTimesheet.ts");
  const output = await runScript(scriptPath, [
    `--start=${actualStart}`,
    `--end=${actualEnd}`,
  ]);

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
if (require.main === module || process.argv[1]?.includes("zucchetti/index")) {
  const force = process.argv.includes("--force");
  const start = process.argv
    .find((a) => a.startsWith("--start="))
    ?.split("=")[1];
  const end = process.argv.find((a) => a.startsWith("--end="))?.split("=")[1];

  collectZucchetti(force, start && end ? { start, end } : undefined)
    .then(() => process.exit(0))
    .catch((err) => {
      log.error(err.message);
      process.exit(1);
    });
}
