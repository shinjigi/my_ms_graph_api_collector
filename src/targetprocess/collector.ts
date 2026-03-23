/**
 * TargetProcess Knowledge Base collector — unified provider chain.
 *
 * Claude API (primary) → Gemini (fallback).  Mirrors the analyzer.ts pattern.
 *
 * Usage:
 *   tsx src/targetprocess/collector.ts --update-kb
 *   tsx src/targetprocess/collector.ts --update-kb --force
 *   tsx src/targetprocess/collector.ts --update-kb --provider=claude|gemini
 */
import * as fs   from 'fs/promises';
import * as path from 'path';
import Anthropic  from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';

dotenv.config();

import { TargetprocessClient } from './client';
import { AnalysisPrompts }     from './prompts';
import type { TpOpenItem, TpUserStat, TpTimeEntry } from './types';

// ─── Paths ───────────────────────────────────────────────────────────────────
const KB_DIR  = path.join(process.cwd(), 'data', 'kb');
const KB_FILE = path.join(KB_DIR, 'us-summaries.json');

// ─── Priority colleagues ──────────────────────────────────────────────────────
const COLLEAGUES_PRIORITY = new Set([
    'Flavio Passera', 'Marco Anselmo', 'Michela Della Misericordia',
    'Susanna Castelletti', 'Nicola Achille', 'Chiara Bonasi',
    'Sara Fiano', 'Marcella Nardone', "Matteo D'Amario",
]);

// ─── Types ───────────────────────────────────────────────────────────────────
export interface KbEntry {
    id:             number;
    entityType:     string;
    name:           string;
    summary:        string;
    tags:           string[];
    userActivities: Record<string, string>;
    cachedAt:       string;
}

interface KbStore {
    updatedAt: string;
    items:     KbEntry[];
}

export interface EnrichedItem {
    item:     TpOpenItem;
    stats:    TpUserStat[];
    logs:     TpTimeEntry[];
    priority: number;
}

// ─── Provider interface ───────────────────────────────────────────────────────
export interface KbCollectorProvider {
    readonly name: string;
    isAvailable(): boolean;
    /** Mutates kbMap in-place; may persist intermediate saves for resilience. */
    collect(items: EnrichedItem[], kbMap: Map<number, KbEntry>): Promise<void>;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
async function loadKb(): Promise<KbStore> {
    try {
        const raw = await fs.readFile(KB_FILE, 'utf-8');
        return JSON.parse(raw) as KbStore;
    } catch {
        return { updatedAt: '', items: [] };
    }
}

export async function saveKb(items: KbEntry[]): Promise<void> {
    await fs.mkdir(KB_DIR, { recursive: true });
    const store: KbStore = { updatedAt: new Date().toISOString(), items };
    await fs.writeFile(KB_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// ─── Claude provider ──────────────────────────────────────────────────────────
class ClaudeKbProvider implements KbCollectorProvider {
    readonly name = 'claude';

    isAvailable(): boolean {
        return !!process.env['CLAUDE_API_KEY'];
    }

    async collect(items: EnrichedItem[], kbMap: Map<number, KbEntry>): Promise<void> {
        const client = new Anthropic({ apiKey: process.env['CLAUDE_API_KEY']! });
        const model  = process.env['CLAUDE_MODEL'] ?? 'claude-haiku-4-5-20251001';

        for (const { item } of items) {
            console.log(`  [claude] #${item.id} — ${item.name}`);
            const message = await client.messages.create({
                model,
                max_tokens: 200,
                messages: [{
                    role:    'user',
                    content: 'Summarize this work item in 2-3 sentences. Focus on what it is and what needs to be done. Be concise and technical.\n\n' +
                             `Type: ${item.entityType}\nID: #${item.id}\nName: ${item.name}\nProject: ${item.projectName}\n` +
                             `Parent: ${item.parentName ?? 'N/A'}\nState: ${item.stateName}`,
                }],
            });

            const block = message.content[0];
            kbMap.set(item.id, {
                id:             item.id,
                entityType:     item.entityType,
                name:           item.name,
                summary:        block.type === 'text' ? block.text.trim() : '',
                tags:           [],
                userActivities: {},
                cachedAt:       new Date().toISOString(),
            });
        }
    }
}

// ─── Gemini provider ──────────────────────────────────────────────────────────
class GeminiKbProvider implements KbCollectorProvider {
    readonly name = 'gemini';

    private readonly maxTpm       = Number.parseInt(process.env['GEMINI_MODEL_MAX_TPM'] ?? '1000000');
    private readonly tpmThreshold = 0.8;

    isAvailable(): boolean {
        return !!process.env['GEMINI_API_KEY'];
    }

    async collect(items: EnrichedItem[], kbMap: Map<number, KbEntry>): Promise<void> {
        const genAI     = new GoogleGenAI({ apiKey: process.env['GEMINI_API_KEY']! });
        const modelName = (process.env['GEMINI_MODEL'] ?? 'gemini-2.0-flash').replace(/['"]/g, '').trim();

        let batch:       EnrichedItem[] = [];
        let batchTokens = 0;

        for (let i = 0; i < items.length; i++) {
            const entry      = items[i];
            const itemTokens = Math.ceil(JSON.stringify(entry).length / 4);

            if (batch.length > 0 && batchTokens + itemTokens > this.maxTpm * this.tpmThreshold) {
                await this.processBatch(batch, genAI, modelName, kbMap);
                await new Promise(r => setTimeout(r, 10_000));
                batch       = [];
                batchTokens = 0;
            }

            batch.push(entry);
            batchTokens += itemTokens;

            if (i === items.length - 1) {
                await this.processBatch(batch, genAI, modelName, kbMap);
            }
        }
    }

    private async processBatch(
        batch:     EnrichedItem[],
        genAI:     GoogleGenAI,
        modelName: string,
        kbMap:     Map<number, KbEntry>,
    ): Promise<void> {
        const prompt = AnalysisPrompts.getBatchAnalysisPrompt(batch);
        console.log(`  [gemini] batch ${batch.length} item (~${Math.ceil(prompt.length / 4)} token)...`);

        const response = await genAI.models.generateContent({
            model:    modelName,
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config:   { responseMimeType: 'application/json' } as any,
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
        const data = JSON.parse(text.replace(/```json|```/g, ''));

        for (const result of (data.results ?? data ?? [])) {
            const original = batch.find(b => b.item.id === result.id);
            if (!original) continue;
            kbMap.set(result.id, {
                id:             original.item.id,
                entityType:     original.item.entityType,
                name:           original.item.name,
                summary:        result.summary ?? '',
                tags:           result.tags ?? [],
                userActivities: result.userActivities ?? {},
                cachedAt:       new Date().toISOString(),
            });
        }

        // Intermediate save after each batch for resilience against rate-limit interruptions
        await saveKb(Array.from(kbMap.values()));
        console.log(`  [gemini] batch salvato.`);
    }
}

// ─── Provider chain ───────────────────────────────────────────────────────────
function buildProviders(forceProvider?: string): KbCollectorProvider[] {
    const all: Record<string, KbCollectorProvider> = {
        claude: new ClaudeKbProvider(),
        gemini: new GeminiKbProvider(),
    };

    if (forceProvider) {
        const p = all[forceProvider];
        if (!p) throw new Error(`Provider sconosciuto: ${forceProvider}. Valori validi: claude, gemini`);
        return [p];
    }

    return [all['claude'], all['gemini']];
}

// ─── CLI entry point ──────────────────────────────────────────────────────────
async function run(): Promise<void> {
    const updateKb    = process.argv.includes('--update-kb');
    const force       = process.argv.includes('--force');
    const providerArg = process.argv.find(a => a.startsWith('--provider='))?.split('=')[1];

    if (!updateKb) {
        console.log('Usage: tsx src/targetprocess/collector.ts --update-kb [--force] [--provider=claude|gemini]');
        process.exit(0);
    }

    const providers = buildProviders(providerArg);
    const client    = new TargetprocessClient();

    console.log('Fetching assigned open items from TargetProcess...');
    const me    = await client.getMe();
    const items = await client.getMyAssignedOpenItems();
    console.log(`Found ${items.length} open items.`);

    const kb    = await loadKb();
    const kbMap = new Map<number, KbEntry>(kb.items.map(e => [e.id, e]));

    // Filter items that need updating
    const toProcess: TpOpenItem[] = items.filter(item =>
        force || !kbMap.has(item.id) || kbMap.get(item.id)!.name !== item.name
    );

    if (toProcess.length === 0) {
        console.log('Nothing to update.');
        return;
    }

    console.log(`Enriching ${toProcess.length} items (fetching stats + logs)...`);
    const enriched: EnrichedItem[] = [];

    for (const item of toProcess) {
        const stats = await client.getAssignableStatistics(item.id);
        const logs  = await client.getTimesByAssignable(item.id);

        const hasMyHours           = stats.some(s => s.userName === me.FullName && s.totalHours > 0);
        const hasColleagueHours    = stats.some(s => COLLEAGUES_PRIORITY.has(s.userName) && s.totalHours > 0);
        const hasColleagueAssigned = item.assignments?.some(a => COLLEAGUES_PRIORITY.has(a)) ?? false;

        enriched.push({
            item,
            stats,
            logs,
            priority: hasMyHours ? 4 : hasColleagueHours ? 3 : hasColleagueAssigned ? 2 : 1,
        });
    }

    // High-priority items first (my hours > colleague hours > colleague assigned > rest), then by ID desc
    enriched.sort((a, b) =>
        b.priority !== a.priority ? b.priority - a.priority : b.item.id - a.item.id
    );

    console.log(`Provider chain: ${providers.map(p => p.name).join(' → ')}`);

    for (const provider of providers) {
        if (!provider.isAvailable()) {
            console.log(`[${provider.name}] non disponibile, skip`);
            continue;
        }

        try {
            console.log(`[${provider.name}] in corso...`);
            await provider.collect(enriched, kbMap);
            await saveKb(Array.from(kbMap.values()));
            console.log(`\nKB aggiornata: ${kbMap.size} entries totali. Scritto in ${KB_FILE}`);
            return;
        } catch (err) {
            console.error(`[${provider.name}] errore: ${(err as Error).message}`);
        }
    }

    throw new Error('Tutti i provider hanno fallito.');
}

run().catch((err: Error) => {
    console.error('Errore:', err.message);
    process.exit(1);
});
