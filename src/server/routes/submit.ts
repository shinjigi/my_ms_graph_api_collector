/**
 * POST /api/submit/:date
 *
 * Submits all approved entries for the given date to TargetProcess.
 * Returns a list of created time-entry IDs.
 */
import { Router, Request, Response } from "express";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { TargetprocessClient } from "../../targetprocess/client";
import { DayProposal, ProposalEntry } from "@shared/analysis";

export const submitRouter = Router();

const PROPOSALS_DIR = path.join(process.cwd(), "data", "proposals");

submitRouter.post("/:date", async (req: Request, res: Response) => {
  const date = req.params["date"] as string;
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);

  let proposal: DayProposal;
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    proposal = JSON.parse(raw) as DayProposal;
  } catch {
    res.status(404).json({ error: `Nessuna proposta per ${date}` });
    return;
  }

  const approvedEntries: ProposalEntry[] = proposal.entries.filter(
    (e) => e.approved,
  );

  if (approvedEntries.length === 0) {
    res.status(400).json({ error: "Nessuna entry approvata da inviare." });
    return;
  }

  const client = new TargetprocessClient();
  const results = [];
  const errors = [];

  for (const entry of approvedEntries) {
    // Skip recurring activities without a taskId (e.g. standup)
    if (entry.taskId == null) {
      const miscId = Number(process.env["MISC_TASK_ID"] ?? "0");
      if (!miscId) {
        errors.push({
          entry: entry.taskName,
          error: "MISC_TASK_ID non configurato",
        });
        continue;
      }
      entry.taskId = miscId;
    }

    try {
      const result = await client.logTime({
        usId: entry.taskId,
        entityType: (entry.entityType === "recurring"
          ? "Task"
          : entry.entityType) as "UserStory" | "Task" | "Bug",
        description: entry.reasoning,
        spent: entry.inferredHours,
        date,
      });
      results.push(result);
    } catch (err) {
      errors.push({ entry: entry.taskName, error: (err as Error).message });
    }
  }

  // Mark entries as submitted in the proposal file
  if (results.length > 0) {
    proposal.entries = proposal.entries.map((e) => {
      if (e.approved && e.taskId != null) {
        return { ...e, status: "applied", approved: true };
      }
      return e;
    });
    await fs.writeFile(filePath, JSON.stringify(proposal, null, 2), "utf-8");
  }

  res.json({ submitted: results.length, errors, results });
});
