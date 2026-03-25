/**
 * GET  /api/proposals           → list all proposal dates
 * GET  /api/proposals/:date     → get proposal for a specific date
 * PATCH /api/proposals/:date    → update (partial) a proposal
 */
import { DayProposal } from "@shared/analysis";
import { Router, Request, Response } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";

export const proposalsRouter = Router();

const PROPOSALS_DIR = path.join(process.cwd(), "data", "proposals");
const AGG_DIR = path.join(process.cwd(), "data", "aggregated");

async function listDates(): Promise<string[]> {
  const files = await fs.readdir(PROPOSALS_DIR).catch(() => [] as string[]);
  return files
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .map((f) => f.replaceAll(".json", ""))
    .sort((a, b) => a.localeCompare(b))
    .reverse();
}

proposalsRouter.get("/", async (_req: Request, res: Response) => {
  const dates = await listDates();
  res.json(dates);
});

proposalsRouter.get("/:date", async (req: Request, res: Response) => {
  const { date } = req.params;
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const proposal = JSON.parse(raw) as DayProposal;

    // Also attach the aggregated signals for the calendar panel
    let signals = null;
    try {
      const aggRaw = await fs.readFile(
        path.join(AGG_DIR, `${date}.json`),
        "utf-8",
      );
      signals = JSON.parse(aggRaw);
    } catch {
      /* signals not available */
    }

    res.json({ proposal, signals });
  } catch {
    res.status(404).json({ error: `Nessuna proposta per ${date}` });
  }
});

proposalsRouter.patch("/:date", async (req: Request, res: Response) => {
  const { date } = req.params;
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const existing = JSON.parse(raw) as DayProposal;

    // Accept partial updates: entries or top-level fields
    const updated: DayProposal = { ...existing, ...req.body };
    await fs.writeFile(filePath, JSON.stringify(updated, null, 2), "utf-8");

    res.json(updated);
  } catch {
    res.status(404).json({ error: `Nessuna proposta per ${date}` });
  }
});
