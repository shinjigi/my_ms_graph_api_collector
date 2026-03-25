import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { readMeta, writeMeta, shouldSkipMonth } from "../utils";
import { createLogger } from "../../logger";

const log = createLogger("zucchetti");
import type { ZucchettiDay } from "@shared/zucchetti";

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

interface ZucchettiRawResponse {
  header: unknown;
  days: ZucchettiDay[];
}

function extractJson(output: string): ZucchettiDay[] {
  const start = output.indexOf("--- START JSON ---");
  const end = output.indexOf("--- END JSON ---");

  if (start === -1 || end === -1) {
    throw new Error("Marker JSON non trovati nell'output di getTimesheet.ts");
  }

  const raw = output.slice(start + "--- START JSON ---".length, end).trim();
  const parsed = JSON.parse(raw) as ZucchettiRawResponse | ZucchettiDay[];

  // Handle both wrapped ({ header, days: [...] }) and flat array formats
  return Array.isArray(parsed) ? parsed : parsed.days;
}

async function collectMonth(
  year: number,
  month: number,
): Promise<ZucchettiDay[]> {
  const scriptPath = path.join(__dirname, "getTimesheet.ts");
  const output = await runScript(scriptPath, [`--month=${month}`, `--year=${year}`]);
  return extractJson(output);
}

export async function collectZucchetti(
  force = false,
  range?: { start: string; end: string },
): Promise<string[]> {
  const since = range
    ? new Date(range.start)
    : new Date(process.env["COLLECT_SINCE"] ?? "2025-01-01");
  const today = new Date().toISOString().slice(0, 10);
  const now = range ? new Date(range.end) : new Date();

  await fs.mkdir(ZUCC_DIR, { recursive: true });

  const meta = await readMeta(ZUCC_DIR);
  const outPaths: string[] = [];
  let current = new Date(since.getFullYear(), since.getMonth(), 1);

  while (current <= now) {
    const year = current.getFullYear();
    const month = current.getMonth() + 1;
    const monthStr = `${year}-${String(month).padStart(2, "0")}`;
    const isCurrentMonth = monthStr === today.slice(0, 7);
    const outPath = path.join(ZUCC_DIR, `${monthStr}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[monthStr], monthStr, ["zucchetti"])
    ) {
      log.info(`${monthStr}: skip`);
      outPaths.push(outPath);
    } else {
      try {
        log.info(`raccolta ${monthStr}...`);
        const days = await collectMonth(year, month);
        await fs.writeFile(outPath, JSON.stringify(days, null, 2), "utf-8");
        await writeMeta(ZUCC_DIR, monthStr, {
          lastExtractedDate: today,
          sources: ["zucchetti"],
        });
        outPaths.push(outPath);
      } catch (err) {
        log.warn(`${monthStr}: ${(err as Error).message}`);
      }
    }

    // Advance to next month
    current = new Date(year, month, 1);
  }

  return outPaths;
}
