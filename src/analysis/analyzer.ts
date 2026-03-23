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
import { SYSTEM_PROMPT, userInstruction } from "./prompts";

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
export interface ProposalEntry {
    taskId: number | null;
    entityType: "UserStory" | "Task" | "Bug" | "recurring";
    taskName: string;
    inferredHours: number;
    confidence: "high" | "medium" | "low";
    reasoning: string;
    approved: boolean;
}

export interface DayProposal {
    date: string;
    oreTarget: number;
    totalHours: number;
    entries: ProposalEntry[];
    generatedAt: string;
    provider?: string;
}

export interface KbEntry {
    id: number;
    entityType: string;
    name: string;
    summary: string;
}

export interface KbStore {
    items: KbEntry[];
}

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

// ─── Provider interface ─────────────────────────────────────────────
export interface AnalyzerProvider {
    readonly name: string;
    isAvailable(): boolean;
    analyze(systemPrompt: string, userPrompt: string): Promise<ProposalEntry[]>;
}

// ─── Shared utilities ───────────────────────────────────────────────
export function stripCodeFence(text: string): string {
    return text
        .replace(/^```(?:json)?\s*/m, "")
        .replace(/\s*```\s*$/m, "")
        .trim();
}

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

export function buildUserPrompt(
    day: AggregatedDay,
    kbItems: KbEntry[],
    defaults: DefaultsConfig,
): string {
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

    const activeTasks = kbItems.map((kb) => ({
        id: kb.id,
        entityType: kb.entityType,
        name: kb.name,
        summary: kb.summary,
    }));

    const preSeeded: ProposalEntry[] = defaults.recurringActivities.map((a) => ({
        taskId: a.taskId,
        entityType: "recurring" as const,
        taskName: a.label,
        inferredHours: a.hours,
        confidence: "high" as const,
        reasoning: a.comment,
        approved: a.autoApprove,
    }));

    return JSON.stringify(
        {
            date: day.date,
            oreTarget: day.oreTarget,
            remainingHours,
            location: day.location,
            signals,
            activeTasks,
            preSeededEntries: preSeeded,
            instruction: userInstruction(remainingHours, day.oreTarget),
        },
        null,
        2,
    );
}

// ─── Provider chain ─────────────────────────────────────────────────
export function buildProviders(forceProvider?: string): AnalyzerProvider[] {
    // Lazy imports to avoid circular deps at module level
    const { ClaudeApiProvider, ClaudeCliProvider } = require("./claudeProvider");
    const { GeminiProvider } = require("./geminiProvider");

    const all: Record<string, AnalyzerProvider> = {
        claude: new ClaudeApiProvider(),
        gemini: new GeminiProvider(),
        cli: new ClaudeCliProvider(),
    };

    if (forceProvider) {
        const p = all[forceProvider];
        if (!p) throw new Error(`Provider sconosciuto: ${forceProvider}`);
        return [p];
    }

    // Default order: Claude API → Gemini → Claude CLI
    return [all["claude"], all["gemini"], all["cli"]];
}

// ─── Core analysis ──────────────────────────────────────────────────
export async function analyzeDay(
    day: AggregatedDay,
    kbItems: KbEntry[],
    defaults: DefaultsConfig,
    providers: AnalyzerProvider[],
): Promise<DayProposal> {
    const system = buildSystemPrompt();
    const user = buildUserPrompt(day, kbItems, defaults);

    let lastError: Error | null = null;
    for (const provider of providers) {
        if (!provider.isAvailable()) {
            console.log(`    [${provider.name}] non disponibile, skip`);
            continue;
        }

        try {
            console.log(`    [${provider.name}] in corso...`);
            const entries = await provider.analyze(system, user);
            const totalHours = entries.reduce((s, e) => s + e.inferredHours, 0);

            return {
                date: day.date,
                oreTarget: day.oreTarget,
                totalHours: Math.round(totalHours * 100) / 100,
                entries,
                generatedAt: new Date().toISOString(),
                provider: provider.name,
            };
        } catch (err) {
            lastError = err as Error;
            const msg = lastError.message;
            console.error(`    [${provider.name}] errore: ${msg}`);

            // Fatal errors — do not try next provider
            if (msg.includes("credit balance is too low")) {
                throw lastError;
            }
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
    const providerArg = process.argv
        .find((a) => a.startsWith("--provider="))
        ?.split("=")[1];

    // KB is a prerequisite — fail fast
    let kbItems: KbEntry[];
    try {
        kbItems = await loadKb();
    } catch {
        console.error(
            "[FATAL] KB mancante: data/kb/us-summaries.json non trovato.\n" +
            "Esegui prima: npm run kb:update",
        );
        process.exit(1);
    }

    const defaults = await loadDefaults();
    const providers = buildProviders(providerArg);
    const sinceDate = process.env["COLLECT_SINCE"] ?? "2025-01-01";

    console.log(`Provider chain: ${providers.map((p) => p.name).join(" → ")}`);

    await fs.mkdir(PROPOSALS_DIR, { recursive: true });

    const aggFiles = (await fs.readdir(AGG_DIR).catch(() => [] as string[]))
        .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .filter((f) => f.replace(".json", "") >= sinceDate)
        .filter((f) => !dateArg || f === `${dateArg}.json`);

    let processed = 0;
    let skipped = 0;

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

        console.log(
            `  Analisi ${date} (target ${day.oreTarget.toFixed(2)}h, ${day.calendar.length} eventi, ${day.gitCommits.length} commit git)...`,
        );

        try {
            const proposal = await analyzeDay(day, kbItems, defaults, providers);
            await fs.writeFile(propPath, JSON.stringify(proposal, null, 2), "utf-8");
            console.log(
                `    → ${proposal.entries.length} entries, totale ${proposal.totalHours}h [${proposal.provider}]`,
            );
            processed++;
        } catch (err) {
            const msg = (err as Error).message;
            console.error(`    Errore per ${date}: ${msg}`);
            if (msg.includes("credit balance is too low")) {
                console.error(
                    "\n[FATAL] Credito Anthropic esaurito. Interruzione processo.",
                );
                process.exit(1);
            }
        }
    }

    console.log(
        `\nAnalisi completata: ${processed} giorni analizzati, ${skipped} saltati.`,
    );
}

// Only run when executed directly (not when imported)
if (require.main === module) {
    run().catch((err: Error) => {
        console.error("Errore analyzer:", err.message);
        process.exit(1);
    });
}
