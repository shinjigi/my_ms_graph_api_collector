/**
 * Async analysis endpoints with job tracking.
 *
 * POST /api/analyse/:date         — analyse a single day (202 + jobId)
 * POST /api/analyse/week/:date    — analyse all workdays in the week (202 + jobId)
 * GET  /api/analyse/status/:jobId — poll job status
 */
import { Router, Request, Response } from "express";
import * as crypto from "node:crypto";
import { access, mkdir } from "node:fs/promises";
import * as path from "node:path";
import { readJson, writeJson } from "../../json-io";
import {
  AGG_DIR,
  PROPOSALS_DIR,
  analyseBatch,
  buildProviders,
  loadKb,
  loadDefaults,
  KB_FILE,
} from "../../analysers";
import { AnalysisJobStatus, DayProposal, ProposalEntry } from "@shared/analysis";
import { AggregatedDay } from "@shared/aggregator";
import { createLogger } from "../../logger";
import { refreshReportedHours } from "../../targetprocess/refreshHours";
const logger = createLogger("api-analyse");

export const analyseRouter = Router();

// ─── In-memory job store ────────────────────────────────────────────
const jobs = new Map<string, AnalysisJobStatus>();

/** Check if KB file exists. */
async function kbExists(): Promise<boolean> {
  try {
    await access(KB_FILE);
    return true;
  } catch {
    return false;
  }
}

/** Load aggregated day from disk, or null if missing. */
async function loadAggDay(date: string): Promise<AggregatedDay | null> {
  return readJson<AggregatedDay | null>(path.join(AGG_DIR, `${date}.json`), null);
}

/** Check if proposal already exists for a date. */
async function proposalExists(date: string): Promise<boolean> {
  try {
    await access(path.join(PROPOSALS_DIR, `${date}.json`));
    return true;
  } catch {
    return false;
  }
}

import { getMonday, shiftDateString, getISOTimestamp, dateToString } from "@shared/dates";

/** Get Monday-to-Friday dates for the week containing the given date. */
function weekDates(dateStr: string): string[] {
  const monday = getMonday(dateStr);
  const dates: string[] = [];
  for (let i = 0; i < 5; i++) {
    dates.push(shiftDateString(monday, i));
  }
  return dates;
}

/** Run analysis for a list of dates in background. */
async function runAnalysis(job: AnalysisJobStatus & { id: string }, force: boolean): Promise<void> {
  job.status = "running";

  try {
    const kbItems = await loadKb();
    const defaults = await loadDefaults();
    const providers = buildProviders();

    await mkdir(PROPOSALS_DIR, { recursive: true });

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

    // Refresh reported hours from TP API (persists to aggregated files too)
    if (daysToProcess.length > 0) {
      await refreshReportedHours(daysToProcess);
    }

    if (daysToProcess.length === 0) {
      logger.info(
        `[analyse-job ${job.id}] Tutti i giorni già analizzati — nessun nuovo proposal da generare (usa force=true per forzare).`,
      );
    } else {
      logger.info(
        `[analyse-job ${job.id}] Analisi batch per ${daysToProcess.length} giorni...`,
      );
      try {
        const proposals = await analyseBatch(
          daysToProcess,
          kbItems,
          defaults,
          providers,
        );
        for (const proposal of proposals) {
          const propPath = path.join(PROPOSALS_DIR, `${dateToString(proposal.date)}.json`);

          // Data integrity: merge user-set statuses/approvals from existing file
          const old = await readJson<DayProposal | null>(propPath, null);
          if (old?.entries) {
            for (const e of proposal.entries) {
              const oe = old.entries.find((x: ProposalEntry) => x.taskId === e.taskId);
              if (oe) {
                // Mantiene 'dismissed' sempre.
                if (oe.status === 'dismissed') {
                  e.status = 'dismissed';
                } else if (oe.status === 'applied') {
                  // Mantiene 'applied' solo se NON è un rianalizza forzato E se le ore non sono cambiate.
                  if (!force && oe.inferredHours === e.inferredHours) {
                    e.status = 'applied';
                  }
                } else if (oe.status) {
                  e.status = oe.status;
                }

                // Gestione vecchi custom overrides
                if (!force && oe.approved != null) e.approved = oe.approved;
              }
            }
          }

          await writeJson(propPath, proposal);
          job.completed[dateToString(proposal.date)] = proposal;
        }
      } catch (err) {
        // Se l'intero batch fallisce, segna errore per tutte le date
        for (const date of daysToProcess.map((d) => dateToString(d.date))) {
          job.errors[date] = (err as Error).message;
          logger.error(
            `[analyse-job ${job.id}] Errore per ${date}: ${(err as Error).message}`,
          );
        }
      }
    }

    job.status =
      Object.keys(job.errors).length > 0 &&
      Object.keys(job.completed).length === 0
        ? "error"
        : "done";
  } catch (err) {
    job.status = "error";
    job.errors["_global"] = (err as Error).message;
  }
}

// POST /api/analyse/:date — single day
analyseRouter.post("/:date", async (req: Request, res: Response) => {
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
  const job: AnalysisJobStatus & { id: string } = {
    id: jobId,
    status: "pending",
    dates: [date],
    completed: {},
    errors: {},
    startedAt: getISOTimestamp(),
  };
  jobs.set(jobId, job);

  // Fire and forget
  void runAnalysis(job, force);

  res.status(202).json({ jobId });
});

// POST /api/analyse/week/:date — all workdays in the week
analyseRouter.post("/week/:date", async (req: Request, res: Response) => {
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
  const job: AnalysisJobStatus & { id: string } = {
    id: jobId,
    status: "pending",
    dates,
    completed: {},
    errors: {},
    startedAt: getISOTimestamp(),
  };
  jobs.set(jobId, job);

  void runAnalysis(job, force);

  res.status(202).json({ jobId, dates });
});

// GET /api/analyse/status/:jobId — poll
analyseRouter.get("/status/:jobId", (req: Request, res: Response) => {
  const jobId = req.params["jobId"] as string;
  const job = jobs.get(jobId);

  if (!job) {
    res.status(404).json({ error: "Job non trovato" });
    return;
  }

  res.json({
    status: job.status,
    dates: job.dates,
    completed: job.completed,
    errors: job.errors,
    startedAt: job.startedAt,
  });

  // Clean up completed jobs after retrieval (keep for 5 min)
  if (job.status === "done" || job.status === "error") {
    setTimeout(() => jobs.delete(jobId), 5 * 60 * 1000);
  }
});
