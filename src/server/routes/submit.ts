/**
 * POST /api/submit/:date
 *
 * Submits all approved entries for the given date to TargetProcess.
 * Returns a list of created time-entry IDs.
 */
import { Router, Request, Response } from "express";
import * as path from "node:path";
import { readJson, writeJson } from "../../json-io";
import { TargetprocessClient } from "../../targetprocess/client";
import { DayProposal, ProposalEntry } from "@shared/analysis";
import { refreshReportedHours } from "../../targetprocess/refreshHours";
import { AggregatedDay } from "@shared/aggregator";

export const submitRouter = Router();

const PROPOSALS_DIR = path.join(process.cwd(), "data", "proposals");

submitRouter.post("/:date", async (req: Request, res: Response) => {
  const date = req.params["date"] as string;
  const filePath = path.join(PROPOSALS_DIR, `${date}.json`);

  const proposal = await readJson<DayProposal | null>(filePath, null);
  if (!proposal) {
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
    await writeJson(filePath, proposal);
  }

  // Refresh reportedHours in the aggregated file so it stays in sync
  if (results.length > 0) {
    const aggPath = path.join(process.cwd(), "data", "aggregated", `${date}.json`);
    const aggDay = await readJson<AggregatedDay | null>(aggPath, null);
    if (aggDay !== null) void refreshReportedHours([aggDay]);
  }

  res.json({ submitted: results.length, errors, results });
});
