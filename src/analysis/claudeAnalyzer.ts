/**
 * Claude AI analyzer.
 *
 * For each aggregated day that has no proposal yet (or --force flag),
 * calls the Claude API to produce a time-allocation proposal.
 *
 * Usage:
 *   tsx src/analysis/claudeAnalyzer.ts             # process only new days
 *   tsx src/analysis/claudeAnalyzer.ts --force      # reprocess all workdays
 *   tsx src/analysis/claudeAnalyzer.ts --date=2026-03-10  # single day
 */
import * as fs      from 'fs/promises';
import * as path    from 'path';
import * as dotenv  from 'dotenv';
import { spawn }    from 'child_process';
import Anthropic    from '@anthropic-ai/sdk';
dotenv.config();

import type { AggregatedDay }  from './aggregator';
import type { TpOpenItem }     from '../targetprocess/types';

const AGG_DIR      = path.join(process.cwd(), 'data', 'aggregated');
const PROPOSALS_DIR = path.join(process.cwd(), 'data', 'proposals');
const KB_FILE      = path.join(process.cwd(), 'data', 'kb', 'us-summaries.json');
const DEFAULTS_FILE = path.join(process.cwd(), 'config', 'defaults.json');

export interface ProposalEntry {
    taskId:         number | null;   // null for recurring activities (standup, etc.)
    entityType:     'UserStory' | 'Task' | 'Bug' | 'recurring';
    taskName:       string;
    inferredHours:  number;
    confidence:     'high' | 'medium' | 'low';
    reasoning:      string;
    approved:       boolean;
}

export interface DayProposal {
    date:        string;
    oreTarget:   number;
    totalHours:  number;
    entries:     ProposalEntry[];
    generatedAt: string;
}

interface KbEntry {
    id:         number;
    entityType: string;
    name:       string;
    summary:    string;
}

interface KbStore {
    items: KbEntry[];
}

interface DefaultActivity {
    id:          string;
    label:       string;
    hours:       number;
    autoApprove: boolean;
    taskId:      number | null;
    comment:     string;
}

interface DefaultsConfig {
    recurringActivities: DefaultActivity[];
}

function stripCodeFence(text: string): string {
    return text
        .replace(/^```(?:json)?\s*/m, '')
        .replace(/\s*```\s*$/m, '')
        .trim();
}

function buildSystemPrompt(): string {
    return `You are a time-tracking assistant. Your job is to allocate work hours to TargetProcess tasks based on activity signals.

RULES:
1. Output ONLY valid JSON — no prose, no markdown fences, no explanations.
2. The sum of all "inferredHours" MUST equal the "oreTarget" value exactly (rounded to 2 decimal places).
3. Use signals (calendar events, Teams messages, git/SVN commits) to infer which tasks were worked on and for how long.
4. When signals are scarce, distribute hours proportionally across active tasks weighted by recent activity.
5. For recurring activities (standup etc.) that are pre-seeded, keep their hours as-is and distribute the remainder.
6. Return a JSON array of ProposalEntry objects.`;
}

function buildUserPrompt(day: AggregatedDay, kbItems: KbEntry[], defaults: DefaultsConfig): string {
    const recurringHours = defaults.recurringActivities.reduce((s, a) => s + a.hours, 0);
    const remainingHours = Math.max(0, day.oreTarget - recurringHours);

    const signals = {
        calendarEvents: day.calendar.map(e => ({
            subject:  e.subject,
            start:    e.start?.dateTime?.slice(11, 16),
            end:      e.end?.dateTime?.slice(11, 16),
            attendees: e.attendees?.length ?? 0,
        })),
        teamsMessages:  day.teams.length,
        gitCommits:     day.gitCommits.map(c => ({ repo: c.repo, message: c.message })),
        svnCommits:     day.svnCommits.map(c => ({ message: c.message })),
        emailsReceived: day.emails.length,
    };

    const activeTasks = kbItems.map(kb => ({
        id:         kb.id,
        entityType: kb.entityType,
        name:       kb.name,
        summary:    kb.summary,
    }));

    const preSeeded: ProposalEntry[] = defaults.recurringActivities.map(a => ({
        taskId:        a.taskId,
        entityType:    'recurring' as const,
        taskName:      a.label,
        inferredHours: a.hours,
        confidence:    'high' as const,
        reasoning:     a.comment,
        approved:      a.autoApprove,
    }));

    return JSON.stringify({
        date:           day.date,
        oreTarget:      day.oreTarget,
        remainingHours,
        location:       day.location,
        signals,
        activeTasks,
        preSeededEntries: preSeeded,
        instruction:    `Allocate exactly ${remainingHours.toFixed(2)}h across the active tasks. ` +
                        `Return a JSON array of ProposalEntry objects (include the pre-seeded entries). ` +
                        `Total must equal ${day.oreTarget.toFixed(2)}h.`,
    }, null, 2);
}

async function loadKb(): Promise<KbEntry[]> {
    try {
        const raw = await fs.readFile(KB_FILE, 'utf-8');
        return (JSON.parse(raw) as KbStore).items;
    } catch {
        return [];
    }
}

async function loadDefaults(): Promise<DefaultsConfig> {
    try {
        const raw = await fs.readFile(DEFAULTS_FILE, 'utf-8');
        return JSON.parse(raw) as DefaultsConfig;
    } catch {
        return { recurringActivities: [] };
    }
}

/** Calls the local `claude` CLI (Claude Code subscription) in non-interactive mode. */
function callClaudeCli(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    return new Promise((resolve, reject) => {
        // Unset CLAUDECODE to allow subprocess invocation outside an active session
        const env = { ...process.env, CLAUDECODE: undefined };
        const proc = spawn('claude', ['-p', '--model', model], { env, stdio: ['pipe', 'pipe', 'pipe'] });

        const chunks: Buffer[] = [];
        proc.stdin.write(`${systemPrompt}\n\n${userPrompt}`);
        proc.stdin.end();

        proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        proc.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
        proc.on('close', (code) => {
            if (code !== 0) reject(new Error(`claude CLI exited with code ${code}`));
            else resolve(Buffer.concat(chunks).toString('utf-8').trim());
        });
        proc.on('error', reject);
    });
}

/**
 * Calls an OpenAI-compatible API (Ollama, LM Studio, OpenRouter, etc.).
 * Requires OPENAI_BASE_URL (e.g. http://localhost:11434/v1) and optionally OPENAI_API_KEY.
 */
async function callOpenAiCompatible(systemPrompt: string, userPrompt: string, model: string): Promise<string> {
    const baseUrl = process.env['OPENAI_BASE_URL']!;
    const apiKey  = process.env['OPENAI_API_KEY'] ?? 'ollama'; // Ollama ignores the key

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method:  'POST',
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt },
            ],
            max_tokens: 1024,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI-compatible API error ${response.status}: ${text}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await response.json() as any;
    return (data.choices?.[0]?.message?.content ?? '') as string;
}

async function analyzeDay(
    day: AggregatedDay,
    kbItems: KbEntry[],
    defaults: DefaultsConfig
): Promise<DayProposal> {
    const model         = process.env['CLAUDE_MODEL'] ?? process.env['OPENAI_MODEL'] ?? 'claude-haiku-4-5-20251001';
    const anthropicKey  = process.env['CLAUDE_API_KEY'];
    const openAiBaseUrl = process.env['OPENAI_BASE_URL'];

    const system = buildSystemPrompt();
    const user   = buildUserPrompt(day, kbItems, defaults);
    let responseText: string;

    if (anthropicKey) {
        // Backend 1: Anthropic API
        const anthropic = new Anthropic({ apiKey: anthropicKey });
        const message   = await anthropic.messages.create({
            model,
            max_tokens: 1024,
            system,
            messages: [{ role: 'user', content: user }],
        });
        const block = message.content[0];
        if (block.type !== 'text') throw new Error('Risposta Claude non testuale');
        responseText = block.text;
    } else if (openAiBaseUrl) {
        // Backend 2: OpenAI-compatible (Ollama, LM Studio, OpenRouter, …)
        responseText = await callOpenAiCompatible(system, user, model);
    } else {
        // Backend 3: Claude Code CLI (uses subscription, no API key required)
        responseText = await callClaudeCli(system, user, model);
    }

    const entries = JSON.parse(stripCodeFence(responseText)) as ProposalEntry[];

    const totalHours = entries.reduce((s, e) => s + e.inferredHours, 0);

    return {
        date:        day.date,
        oreTarget:   day.oreTarget,
        totalHours:  Math.round(totalHours * 100) / 100,
        entries,
        generatedAt: new Date().toISOString(),
    };
}

async function run(): Promise<void> {
    const force     = process.argv.includes('--force');
    const dateArg   = process.argv.find(a => a.startsWith('--date='))?.split('=')[1];

    const backend =
        process.env['CLAUDE_API_KEY']  ? 'Anthropic API' :
        process.env['OPENAI_BASE_URL'] ? `OpenAI-compatible (${process.env['OPENAI_BASE_URL']})` :
        'Claude Code CLI (subscription)';
    console.log(`LLM backend: ${backend}`);

    const kbItems   = await loadKb();
    const defaults  = await loadDefaults();

    await fs.mkdir(PROPOSALS_DIR, { recursive: true });

    const aggFiles  = (await fs.readdir(AGG_DIR).catch(() => [] as string[]))
        .filter(f => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
        .filter(f => !dateArg || f === `${dateArg}.json`);

    let processed = 0;
    let skipped   = 0;

    for (const file of aggFiles) {
        const date      = file.replace('.json', '');
        const propPath  = path.join(PROPOSALS_DIR, file);

        // Skip if proposal already exists and --force not set
        if (!force) {
            try {
                await fs.access(propPath);
                skipped++;
                continue;
            } catch {
                // Proposal does not exist — proceed
            }
        }

        const aggRaw = await fs.readFile(path.join(AGG_DIR, file), 'utf-8');
        const day    = JSON.parse(aggRaw) as AggregatedDay;

        if (!day.isWorkday) {
            skipped++;
            continue;
        }

        console.log(`  Analisi ${date} (target ${day.oreTarget.toFixed(2)}h, ${day.calendar.length} eventi, ${day.gitCommits.length} commit git)...`);

        try {
            const proposal = await analyzeDay(day, kbItems, defaults);
            await fs.writeFile(propPath, JSON.stringify(proposal, null, 2), 'utf-8');
            console.log(`    → ${proposal.entries.length} entries, totale ${proposal.totalHours}h`);
            processed++;
        } catch (err) {
            console.error(`    Errore per ${date}: ${(err as Error).message}`);
        }
    }

    console.log(`\nAnalisi completata: ${processed} giorni analizzati, ${skipped} saltati.`);
}

run().catch((err: Error) => {
    console.error('Errore analyzer:', err.message);
    process.exit(1);
});
