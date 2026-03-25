/**
 * Unified analyzer orchestrator.
 *
 * Provides the AnalyzerProvider interface, shared types, prompt-building logic,
 * and the fallback chain (Claude API → Gemini → Claude CLI).
 *
 * CLI usage:
 *   tsx src/analysis/analyzer.ts                         # process only new days
 *   tsx src/analysis/analyzer.ts --force                 # reprocess all workdays
 *   tsx src/analysis/analyzer.ts --date=2026-03-10       # single day
 *   tsx src/analysis/analyzer.ts --provider=gemini       # force a specific provider
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as dotenv from "dotenv";

dotenv.config();

import type { AggregatedDay } from "./aggregator";
import type { ProposalEntry, DayProposal } from "@shared/analysis";
import type { KbEntry, KbStore } from "@shared/kb";
import { SYSTEM_PROMPT, userInstruction } from "./prompts";
import { createLogger } from "../logger";
import {
  ClaudeApiProvider,
  ClaudeCliProvider,
  OpenAiCompatibleProvider,
} from "./claudeProvider";
import { GeminiProvider } from "./geminiProvider";
export {
  AnalyzerProvider,
  BatchAnalyzerProvider,
  stripCodeFence,
} from "./base";

const log = createLogger("analyzer");

// ─── Paths ──────────────────────────────────────────────────────────
export const AGG_DIR = path.join(process.cwd(), "data", "aggregated");
export const PROPOSALS_DIR = path.join(process.cwd(), "data", "proposals");
export const KB_FILE = path.join(
  process.cwd(),
  "data",
  "kb",
  "us-summaries.json",
);
export const DEFAULTS_FILE = path.join(
  process.cwd(),
  "config",
  "defaults.json",
);

// ─── Types ──────────────────────────────────────────────────────────

export interface DefaultActivity {
  id: string;
  label: string;
  hours: number;
  autoApprove: boolean;
  taskId: number | null;
  comment: string;
}

export interface DefaultsConfig {
  recurringActivities: DefaultActivity[];
}

// ─── Shared utilities ───────────────────────────────────────────────
import { AnalyzerProvider, BatchAnalyzerProvider } from "./base";

export async function loadKb(): Promise<KbEntry[]> {
  const raw = await fs.readFile(KB_FILE, "utf-8");
  return (JSON.parse(raw) as KbStore).items;
}

export async function loadDefaults(): Promise<DefaultsConfig> {
  try {
    const raw = await fs.readFile(DEFAULTS_FILE, "utf-8");
    return JSON.parse(raw) as DefaultsConfig;
  } catch {
    return { recurringActivities: [] };
  }
}

// ─── Prompt building ────────────────────────────────────────────────
export function buildSystemPrompt(): string {
  return SYSTEM_PROMPT;
}

export function buildUserPromptBatched(
  days: AggregatedDay[],
  kbItems: KbEntry[],
  defaults: DefaultsConfig,
): string {
  const activeTasks = kbItems.map((kb) => ({
    id: kb.id,
    entityType: kb.entityType,
    name: kb.name,
    summary: kb.summary,
  }));

  const daysContext = days.map((day) => {
    const recurringHours = defaults.recurringActivities.reduce(
      (s, a) => s + a.hours,
      0,
    );
    const remainingHours = Math.max(0, day.oreTarget - recurringHours);

    const signals = {
      calendarEvents: day.calendar.map((e) => ({
        subject: e.subject,
        start: e.start?.dateTime?.slice(11, 16),
        end: e.end?.dateTime?.slice(11, 16),
        attendees: e.attendees?.length ?? 0,
      })),
      teamsMessages: day.teams.length,
      gitCommits: day.gitCommits.map((c) => ({
        repo: c.repo,
        message: c.message,
      })),
      svnCommits: day.svnCommits.map((c) => ({ message: c.message })),
      emailsReceived: day.emails.length,
    };

    const preSeeded: ProposalEntry[] = defaults.recurringActivities.map(
      (a) => ({
        taskId: a.taskId,
        entityType: "recurring" as const,
        taskName: a.label,
        inferredHours: a.hours,
        confidence: "high" as const,
        reasoning: a.comment,
        approved: a.autoApprove,
      }),
    );

    return {
      date: day.date,
      oreTarget: day.oreTarget,
      remainingHours,
      location: day.location,
      signals,
      preSeededEntries: preSeeded,
    };
  });

  return JSON.stringify(
    {
      activeTasks,
      days: daysContext,
      instruction: userInstruction(),
    },
    null,
    2,
  );
}

// ─── Provider chain ─────────────────────────────────────────────────
export function buildProviders(forceProvider?: string): AnalyzerProvider[] {
  const all: Record<string, AnalyzerProvider> = {
    claude: new ClaudeApiProvider(),
    ollama: new OpenAiCompatibleProvider(),
    gemini: new GeminiProvider(),
    cli: new ClaudeCliProvider(),
  };

  if (forceProvider) {
    const p = all[forceProvider];
    if (!p) throw new Error(`Provider sconosciuto: ${forceProvider}`);
    return [p];
  }

  // Default order: Claude API → Ollama/OpenAICompat → Gemini → Claude CLI
  return [all["claude"], all["ollama"], all["gemini"], all["cli"]];
}

// ─── Core analysis ──────────────────────────────────────────────────
export async function analyzeBatch(
  batch: AggregatedDay[],
  kbItems: KbEntry[],
  defaults: DefaultsConfig,
  providers: AnalyzerProvider[],
): Promise<DayProposal[]> {
  const system = buildSystemPrompt();
  const user = buildUserPromptBatched(batch, kbItems, defaults);

  let lastError: Error | null = null;
  for (const provider of providers) {
    if (!provider.isAvailable()) {
      log.warn(`[${provider.name}] non disponibile, skip`);
      continue;
    }

    try {
      log.info(`[${provider.name}] in corso per ${batch.length} giorni...`);

      let results: { date: string; entries: ProposalEntry[] }[];
      if ("analyzeBatch" in provider) {
        results = await (provider as BatchAnalyzerProvider).analyzeBatch(
          system,
          user,
        );
      } else {
        // fallback to single day queries sequentially!
        results = [];
        for (const day of batch) {
          const singleSystem = buildSystemPrompt();
          const singleUser = buildUserPromptBatched([day], kbItems, defaults);
          const entries = await provider.analyze(singleSystem, singleUser);
          results.push({ date: day.date, entries });
        }
      }

      return results.map((r) => {
        const day = batch.find((d) => d.date === r.date)!;
        const totalHours = r.entries.reduce((s, e) => s + e.inferredHours, 0);
        return {
          date: r.date,
          oreTarget: day?.oreTarget ?? 0,
          totalHours: Math.round(totalHours * 100) / 100,
          entries: r.entries,
          generatedAt: new Date().toISOString(),
          provider: provider.name,
        };
      });
    } catch (err) {
      lastError = err as Error;
      log.error(`[${provider.name}] errore: ${lastError.message}`);
    }
  }

  throw lastError ?? new Error("Nessun provider disponibile");
}

// ─── CLI entry point ────────────────────────────────────────────────
async function run(): Promise<void> {
  const force = process.argv.includes("--force");
  const dateArg = process.argv
    .find((a) => a.startsWith("--date="))
    ?.split("=")[1];
  const startDateArg = process.argv
    .find((a) => a.startsWith("--start-date="))
    ?.split("=")[1];
  const endDateArg = process.argv
    .find((a) => a.startsWith("--end-date="))
    ?.split("=")[1];
  const weekArg = process.argv
    .find((a) => a.startsWith("--week="))
    ?.split("=")[1];
  const providerArg = process.argv
    .find((a) => a.startsWith("--provider="))
    ?.split("=")[1];

  let weekStart = "";
  let weekEnd = "";
  if (weekArg) {
    const [yearStr, weekStr] = weekArg.split("-");
    const year = Number.parseInt(yearStr, 10);
    const week = Number.parseInt(weekStr.replace("W", ""), 10);
    const date = new Date(year, 0, 1 + (week - 1) * 7);
    const day = date.getDay();
    const start = new Date(date);
    start.setDate(date.getDate() - day + (day === 0 ? -6 : 1));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    weekStart = start.toISOString().split("T")[0];
    weekEnd = end.toISOString().split("T")[0];
  }

  // KB is a prerequisite — fail fast
  let kbItems: KbEntry[];
  try {
    kbItems = await loadKb();
  } catch {
    log.error(
      "[FATAL] KB mancante: data/kb/us-summaries.json non trovato. Esegui prima: npm run kb:update",
    );
    process.exit(1);
  }

  const defaults = await loadDefaults();
  const providers = buildProviders(providerArg);
  const sinceDate = process.env["COLLECT_SINCE"] ?? "2025-01-01";

  log.info(`Provider chain: ${providers.map((p) => p.name).join(" → ")}`);

  await fs.mkdir(PROPOSALS_DIR, { recursive: true });

  const aggFiles = (await fs.readdir(AGG_DIR).catch(() => [] as string[]))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter((f) => f.replace(".json", "") >= sinceDate)
    .filter((f) => {
      const dateStr = f.replace(".json", "");
      if (dateArg && dateStr !== dateArg) return false;
      if (startDateArg && dateStr < startDateArg) return false;
      if (endDateArg && dateStr > endDateArg) return false;
      if (weekStart && dateStr < weekStart) return false;
      if (weekEnd && dateStr > weekEnd) return false;
      return true;
    });

  let processed = 0;
  let skipped = 0;

  const maxTpm = 30000;
  let currentBatch: AggregatedDay[] = [];
  let currentTokens = 0;

  const processBatch = async () => {
    if (currentBatch.length === 0) return;

    try {
      const proposals = await analyzeBatch(
        currentBatch,
        kbItems,
        defaults,
        providers,
      );
      for (const proposal of proposals) {
        const propPath = path.join(PROPOSALS_DIR, `${proposal.date}.json`);
        await fs.writeFile(
          propPath,
          JSON.stringify(proposal, null, 2),
          "utf-8",
        );
        log.debug(
          `    → ${proposal.date}: ${proposal.entries.length} entries, totale ${proposal.totalHours}h [${proposal.provider}]`,
        );
        processed++;
      }
    } catch (err) {
      const msg = (err as Error).message;
      log.error(
        `    Errore batch per le date da ${currentBatch[0]?.date} a ${currentBatch.at(-1)?.date}: ${msg}`,
      );
      if (msg.includes("credit balance is too low")) {
        log.error(
          "\n[FATAL] Credito Anthropic esaurito. Interruzione processo.",
        );
        process.exit(1);
      }
    }

    currentBatch = [];
    currentTokens = 0;
  };

  for (const file of aggFiles) {
    const date = file.replace(".json", "");
    const propPath = path.join(PROPOSALS_DIR, file);

    if (!force) {
      try {
        await fs.access(propPath);
        skipped++;
        continue;
      } catch {
        // Proposal does not exist — proceed
      }
    }

    const aggRaw = await fs.readFile(path.join(AGG_DIR, file), "utf-8");
    const day = JSON.parse(aggRaw) as AggregatedDay;

    if (!day.isWorkday) {
      skipped++;
      continue;
    }

    log.info(
      `  Accodo ${date} (target ${day.oreTarget.toFixed(2)}h, ${day.calendar.length} eventi, ${day.gitCommits.length} commit)...`,
    );

    const estTokens = Math.ceil(aggRaw.length / 4);
    if (currentTokens + estTokens > maxTpm && currentBatch.length > 0) {
      await processBatch();
    }

    currentBatch.push(day);
    currentTokens += estTokens;
  }

  await processBatch();

  log.info(
    `Analisi completata: ${processed} giorni analizzati, ${skipped} saltati.`,
  );
}

// Only run when executed directly (not when imported)
if (require.main === module) {
  run().catch((err: Error) => {
    log.error(`Errore analyzer: ${err.message}`);
    process.exit(1);
  });
}
