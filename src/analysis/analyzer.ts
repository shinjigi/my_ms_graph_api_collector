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

import { shiftDate, getISOTimestamp } from "@shared/dates";
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
export { AnalyzerProvider, stripCodeFence } from "./base";

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
import { AnalyzerProvider } from "./base";
import { AggregatedDay } from "@shared/aggregator";

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


/**
 * Filters KB items to those relevant to the analysis period.
 * Open items (isFinalState === false) are always kept.
 * Closed items are kept only if created or last active within the window.
 */
function filterKbByPeriod(items: KbEntry[], batchDates: string[]): KbEntry[] {
  if (batchDates.length === 0) return items;
  const windowDays = Number(process.env["KB_RELEVANCE_WINDOW_DAYS"] ?? 90);
  const batchMin = batchDates.reduce((a, b) => (a < b ? a : b));
  const batchMax = batchDates.reduce((a, b) => (a > b ? a : b));
  const windowStart = shiftDate(batchMin, -windowDays);
  const windowEnd = shiftDate(batchMax, windowDays);

  return items.filter((e) => {
    if (!e.createDate) return true; // legacy entry — keep
    if (e.isFinalState === false) return true; // still open — always keep
    // Closed or unknown: keep only if created or active within window
    const inWindow =
      (e.createDate >= windowStart && e.createDate <= windowEnd) ||
      (e.lastActivityDate != null && e.lastActivityDate >= windowStart);
    return inWindow;
  });
}

/** Sorts KB items by relevance to the batch period (most relevant first). */
function sortKbByRelevance(items: KbEntry[], batchDates: string[]): KbEntry[] {
  if (batchDates.length === 0) return items;
  const batchSet = new Set(batchDates);
  const batchMin = batchDates.reduce((a, b) => (a < b ? a : b));
  const windowDays = Number(process.env["KB_RELEVANCE_WINDOW_DAYS"] ?? 90);
  const windowStart = shiftDate(batchMin, -windowDays);

  const score = (e: KbEntry): number => {
    let s = 0;
    if (e.lastActivityDate) {
      if (batchSet.has(e.lastActivityDate)) s += 3;
      else if (e.lastActivityDate >= windowStart) s += 2;
      else s += 1;
    }
    if (e.isFinalState === false) s += 1;
    return s;
  };

  return [...items].sort((a, b) => {
    const ds = score(b) - score(a);
    if (ds !== 0) return ds;
    return (b.lastActivityDate ?? "").localeCompare(a.lastActivityDate ?? "");
  });
}

/** Truncate KB items to fit within a character budget (for small-context providers). */
function fitKbItems(items: KbEntry[], budgetChars: number): KbEntry[] {
  let total = 0;
  const result: KbEntry[] = [];
  for (const item of items) {
    const est = item.name.length + (item.summary?.length ?? 0) + 40;
    if (total + est > budgetChars) break;
    result.push(item);
    total += est;
  }
  return result;
}

// ─── Core analysis ──────────────────────────────────────────────────
export async function analyzeBatch(
  batch: AggregatedDay[],
  kbItems: KbEntry[],
  defaults: DefaultsConfig,
  providers: AnalyzerProvider[],
): Promise<DayProposal[]> {
  const system = buildSystemPrompt();

  const batchDates = batch.map((d) => d.date);
  const filteredKb = filterKbByPeriod(kbItems, batchDates);
  const sortedKb = sortKbByRelevance(filteredKb, batchDates);
  log.info(
    `KB filtrata: ${sortedKb.length}/${kbItems.length} items per il periodo`,
  );

  let lastError: Error | null = null;
  for (const provider of providers) {
    // Fit KB items within 60% of the provider's budget — leave the rest for day data + response
    const kbBudgetChars = Math.floor(provider.maxInputChars * 0.6);
    const kbItemsForProvider = fitKbItems(sortedKb, kbBudgetChars);
    if (kbItemsForProvider.length < sortedKb.length) {
      log.warn(
        `[${provider.name}] KB ridotto: ${kbItemsForProvider.length}/${sortedKb.length} items (budget ${kbBudgetChars} chars)`,
      );
    }

    const user = buildUserPromptBatched(batch, kbItemsForProvider, defaults);
    const promptChars = system.length + user.length;
    log.info(
      `Batch di ${batch.length} giorni — prompt ~${promptChars} chars (KB: ${kbItemsForProvider.length} items)`,
    );

    if (promptChars > provider.maxInputChars) {
      log.warn(
        `[${provider.name}] prompt (${promptChars} chars) supera il limite (${provider.maxInputChars} chars) — tentativo comunque`,
      );
    }

    try {
      log.info(
        `[${provider.name}] avvio analisi per ${batch.length} giorni...`,
      );
      const t0 = Date.now();
      const results = await provider.analyzeBatch(system, user);
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

      const batchDates = new Set(batch.map((d) => d.date));
      const validResults = results.filter((r) => batchDates.has(r.date));
      if (validResults.length < results.length) {
        log.warn(
          `[${provider.name}] scartati ${results.length - validResults.length} risultati con date fuori dal batch (allucinazioni: ${results
            .filter((r) => !batchDates.has(r.date))
            .map((r) => r.date)
            .join(", ")})`,
        );
      }

      log.info(
        `[${provider.name}] analisi completata in ${elapsed}s — ${validResults.length}/${results.length} giorni validi`,
      );
      return validResults.map((r) => {
        const day = batch.find((d) => d.date === r.date)!;
        const totalHours = r.entries.reduce((s, e) => s + e.inferredHours, 0);
        return {
          date: r.date,
          oreTarget: day?.oreTarget ?? 0,
          totalHours: Math.round(totalHours * 100) / 100,
          entries: r.entries,
          generatedAt: getISOTimestamp(),
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
    const week = Number.parseInt(weekStr.replaceAll("W", ""), 10);
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
  const allProviders = buildProviders(providerArg);
  const sinceDate = process.env["COLLECT_SINCE"] ?? "2025-01-01";

  log.info(
    `Provider configurati: ${allProviders.map((p) => p.name).join(", ")}`,
  );
  log.info("Verifica disponibilità provider...");

  const providers: AnalyzerProvider[] = [];
  for (const p of allProviders) {
    const ok = await p.isAvailable();
    if (ok) {
      log.info(
        `  ✓ ${p.name} — max ${p.maxInputChars.toLocaleString()} chars per batch`,
      );
      providers.push(p);
    } else {
      log.warn(`  ✗ ${p.name} — non disponibile`);
    }
  }

  if (providers.length === 0) {
    log.error(
      "[FATAL] Nessun provider disponibile. Controlla le variabili d'ambiente.",
    );
    process.exit(1);
  }

  log.info(`Provider attivi: ${providers.map((p) => p.name).join(" → ")}`);

  await fs.mkdir(PROPOSALS_DIR, { recursive: true });

  const aggFiles = (await fs.readdir(AGG_DIR).catch(() => [] as string[]))
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .filter((f) => f.replaceAll(".json", "") >= sinceDate)
    .filter((f) => {
      const dateStr = f.replaceAll(".json", "");
      if (dateArg && dateStr !== dateArg) return false;
      if (startDateArg && dateStr < startDateArg) return false;
      if (endDateArg && dateStr > endDateArg) return false;
      if (weekStart && dateStr < weekStart) return false;
      if (weekEnd && dateStr > weekEnd) return false;
      return true;
    });

  let processed = 0;
  let skipped = 0;

  // Use the most restrictive provider's char budget to avoid oversized prompts
  const maxInputChars = Math.min(...providers.map((p) => p.maxInputChars));
  log.info(
    `Batch budget: ${maxInputChars.toLocaleString()} chars (provider più restrittivo: ${providers.find((p) => p.maxInputChars === maxInputChars)?.name})`,
  );

  let currentBatch: AggregatedDay[] = [];

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
  };

  for (const file of aggFiles) {
    const date = file.replaceAll(".json", "");
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

    // Measure actual prompt size (not raw file — which includes browser history etc.)
    const system = buildSystemPrompt();
    const testUser = buildUserPromptBatched(
      [...currentBatch, day],
      kbItems,
      defaults,
    );
    const projectedChars = system.length + testUser.length;

    log.info(
      `  Accodo ${date} — target ${day.oreTarget.toFixed(2)}h, ${day.calendar.length} eventi, ${day.gitCommits.length} commit — prompt proiettato ~${projectedChars} chars`,
    );

    if (projectedChars > maxInputChars && currentBatch.length > 0) {
      log.debug(
        `Batch pieno (${projectedChars} > ${maxInputChars}) — flush prima di aggiungere ${date}`,
      );
      await processBatch();
    }

    currentBatch.push(day);
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
