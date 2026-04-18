/**
 * GET  /api/proposals           → list all proposal dates
 * GET  /api/proposals/:date     → get proposal for a specific date
 * PATCH /api/proposals/:date    → update (partial) a proposal
 */
import { DayProposal } from "@shared/analysis";
import { Router, Request, Response } from "express";
import * as path from "node:path";
import { readJson, writeJson, listJsonFiles } from "../../json-io";

export const proposalsRouter = Router();

const PROPOSALS_DIR = path.join(process.cwd(), "data", "proposals");
const AGG_DIR = path.join(process.cwd(), "data", "aggregated");

async function listDates(): Promise<string[]> {
  return listJsonFiles(PROPOSALS_DIR, {
    pattern: /^\d{4}-\d{2}-\d{2}\.json$/,
    stripExtension: true,
    sortDir: "desc",
  });
}

proposalsRouter.get("/", async (_req: Request, res: Response) => {
  const dates = await listDates();
  res.json(dates);
});

proposalsRouter.get("/:date", async (req: Request, res: Response) => {
  const { date } = req.params;
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);

  const proposal = await readJson<DayProposal | null>(filePath, null);
  if (!proposal) {
    res.status(404).json({ error: `Nessuna proposta per ${date}` });
    return;
  }

  // Also attach the aggregated signals for the calendar panel
  const signals = await readJson<unknown>(path.join(AGG_DIR, `${date}.json`), null);

  res.json({ proposal, signals });
});

proposalsRouter.patch("/:date", async (req: Request, res: Response) => {
  const { date } = req.params;
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);

  const existing = await readJson<DayProposal | null>(filePath, null);
  if (!existing) {
    res.status(404).json({ error: `Nessuna proposta per ${date}` });
    return;
  }

  // Accept partial updates: entries or top-level fields
  const updated: DayProposal = { ...existing, ...req.body };
  await writeJson(filePath, updated);

  res.json(updated);
});
