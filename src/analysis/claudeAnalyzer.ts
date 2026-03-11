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

async function analyzeDay(
    day: AggregatedDay,
    anthropic: Anthropic,
    kbItems: KbEntry[],
    defaults: DefaultsConfig
): Promise<DayProposal> {
    const model   = process.env['CLAUDE_MODEL'] ?? 'claude-haiku-4-5-20251001';

    const message = await anthropic.messages.create({
        model,
        max_tokens:  1024,
        system:      buildSystemPrompt(),
        messages: [{
            role:    'user',
            content: buildUserPrompt(day, kbItems, defaults),
        }],
    });

    const block = message.content[0];
    if (block.type !== 'text') {
        throw new Error('Risposta Claude non testuale');
    }

    const entries = JSON.parse(stripCodeFence(block.text)) as ProposalEntry[];

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

    const apiKey = process.env['CLAUDE_API_KEY'];
    if (!apiKey) {
        throw new Error('CLAUDE_API_KEY mancante in .env');
    }

    const anthropic = new Anthropic({ apiKey });
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
            const proposal = await analyzeDay(day, anthropic, kbItems, defaults);
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
