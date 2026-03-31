/**
 * Async analysis endpoints with job tracking.
 *
 * POST /api/analyze/:date         — analyze a single day (202 + jobId)
 * POST /api/analyze/week/:date    — analyze all workdays in the week (202 + jobId)
 * GET  /api/analyze/status/:jobId — poll job status
 */
import { Router, Request, Response } from "express";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  AGG_DIR,
  PROPOSALS_DIR,
  analyzeBatch,
  buildProviders,
  loadKb,
  loadDefaults,
  KB_FILE,
} from "../../analysis/analyzer";
import { DayProposal } from "@shared/analysis";
import { AggregatedDay } from "@shared/aggregator";

export const analyzeRouter = Router();

// ─── In-memory job store ────────────────────────────────────────────
interface AnalysisJob {
  id: string;
  status: "pending" | "running" | "done" | "error";
  dates: string[];
  results: Record<string, DayProposal>;
  errors: Record<string, string>;
  startedAt: string;
}

const jobs = new Map<string, AnalysisJob>();

/** Check if KB file exists. */
async function kbExists(): Promise<boolean> {
  try {
    await fs.access(KB_FILE);
    return true;
  } catch {
    return false;
  }
}

/** Load aggregated day from disk, or null if missing. */
async function loadAggDay(date: string): Promise<AggregatedDay | null> {
  try {
    const raw = await fs.readFile(path.join(AGG_DIR, `${date}.json`), "utf-8");
    return JSON.parse(raw) as AggregatedDay;
  } catch {
    return null;
  }
}

/** Check if proposal already exists for a date. */
async function proposalExists(date: string): Promise<boolean> {
  try {
    await fs.access(path.join(PROPOSALS_DIR, `${date}.json`));
    return true;
  } catch {
    return false;
  }
}

import { getMonday, shiftDate, getISOTimestamp } from "@shared/dates";

/** Get Monday-to-Friday dates for the week containing the given date. */
function weekDates(dateStr: string): string[] {
  const monday = getMonday(dateStr);
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    dates.push(shiftDate(monday, i));
  }
  return dates;
}

/** Run analysis for a list of dates in background. */
async function runAnalysis(job: AnalysisJob, force: boolean): Promise<void> {
  job.status = "running";

  try {
    const kbItems = await loadKb();
    const defaults = await loadDefaults();
    const providers = buildProviders();

    await fs.mkdir(PROPOSALS_DIR, { recursive: true });

    const daysToProcess: AggregatedDay[] = [];

    for (const date of job.dates) {
      // Skip if proposal exists and not forced
      if (!force && (await proposalExists(date))) {
        continue;
      }

      const day = await loadAggDay(date);
      if (!day?.isWorkday) continue;
      daysToProcess.push(day);
    }

    if (daysToProcess.length === 0) {
      console.log(
        `[analyze-job ${job.id}] Tutti i giorni già analizzati — nessun nuovo proposal da generare (usa force=true per forzare).`,
      );
    } else {
      console.log(
        `[analyze-job ${job.id}] Analisi batch per ${daysToProcess.length} giorni...`,
      );
      try {
        const proposals = await analyzeBatch(
          daysToProcess,
          kbItems,
          defaults,
          providers,
        );
        for (const proposal of proposals) {
          await fs.writeFile(
            path.join(PROPOSALS_DIR, `${proposal.date}.json`),
            JSON.stringify(proposal, null, 2),
            "utf-8",
          );
          job.results[proposal.date] = proposal;
        }
      } catch (err) {
        // Se l'intero batch fallisce, segna errore per tutte le date
        for (const date of daysToProcess.map((d) => d.date)) {
          job.errors[date] = (err as Error).message;
          console.error(
            `[analyze-job ${job.id}] Errore per ${date}: ${(err as Error).message}`,
          );
        }
      }
    }

    job.status =
      Object.keys(job.errors).length > 0 &&
      Object.keys(job.results).length === 0
        ? "error"
        : "done";
  } catch (err) {
    job.status = "error";
    job.errors["_global"] = (err as Error).message;
  }
}

// POST /api/analyze/:date — single day
analyzeRouter.post("/:date", async (req: Request, res: Response) => {
  const date = req.params["date"] as string;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Formato data non valido (YYYY-MM-DD)" });
    return;
  }

  if (!(await kbExists())) {
    res.status(400).json({
      error: "KB mancante: esegui prima npm run kb:update",
    });
    return;
  }

  const force = req.query["force"] === "true";
  const jobId = crypto.randomUUID();
  const job: AnalysisJob = {
    id: jobId,
    status: "pending",
    dates: [date],
    results: {},
    errors: {},
    startedAt: getISOTimestamp(),
  };
  jobs.set(jobId, job);

  // Fire and forget
  void runAnalysis(job, force);

  res.status(202).json({ jobId });
});

// POST /api/analyze/week/:date — all workdays in the week
analyzeRouter.post("/week/:date", async (req: Request, res: Response) => {
  const date = req.params["date"] as string;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "Formato data non valido (YYYY-MM-DD)" });
    return;
  }

  if (!(await kbExists())) {
    res.status(400).json({
      error: "KB mancante: esegui prima npm run kb:update",
    });
    return;
  }

  const force = req.query["force"] === "true";
  const dates = weekDates(date);
  const jobId = crypto.randomUUID();
  const job: AnalysisJob = {
    id: jobId,
    status: "pending",
    dates,
    results: {},
    errors: {},
    startedAt: getISOTimestamp(),
  };
  jobs.set(jobId, job);

  void runAnalysis(job, force);

  res.status(202).json({ jobId, dates });
});

// GET /api/analyze/status/:jobId — poll
analyzeRouter.get("/status/:jobId", (req: Request, res: Response) => {
  const jobId = req.params["jobId"] as string;
  const job = jobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: "Job non trovato" });
    return;
  }

  res.json({
    status: job.status,
    dates: job.dates,
    completed: job.results,
    errors: job.errors,
    startedAt: job.startedAt,
  });

  // Clean up completed jobs after retrieval (keep for 5 min)
  if (job.status === "done" || job.status === "error") {
    setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
  }
});
