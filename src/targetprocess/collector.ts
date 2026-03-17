/**
 * TargetProcess Knowledge Base collector.
 *
 * Usage: tsx src/targetprocess/collector.ts --update-kb
 *
 * For each assigned open item, compares lastModifiedDate with cachedAt in the
 * existing KB. If the item changed (or is not yet cached), calls Claude to
 * produce a 2-3 sentence plain-English summary and persists it to data/kb/.
 *
 * This script is intentionally standalone — it should NOT be called automatically
 * by the analyzer on every run. Schedule it manually or weekly.
 */
import * as fs   from 'fs/promises';
import * as path from 'path';
import Anthropic  from '@anthropic-ai/sdk';
import * as dotenv from 'dotenv';

dotenv.config();

import { TargetprocessClient } from './client';
import type { TpOpenItem }     from './types';

const KB_DIR   = path.join(process.cwd(), 'data', 'kb');
const KB_FILE  = path.join(KB_DIR, 'us-summaries.json');

interface KbEntry {
    id:          number;
    entityType:  string;
    name:        string;
    summary:     string;
    cachedAt:    string;   // ISO timestamp
}

interface KbStore {
    updatedAt: string;
    items:     KbEntry[];
}

async function loadKb(): Promise<KbStore> {
    try {
        const raw = await fs.readFile(KB_FILE, 'utf-8');
        return JSON.parse(raw) as KbStore;
    } catch {
        return { updatedAt: '', items: [] };
    }
}

async function generateSummary(item: TpOpenItem, anthropic: Anthropic): Promise<string> {
    const model   = process.env['CLAUDE_MODEL'] ?? 'claude-haiku-4-5-20251001';
    const message = await anthropic.messages.create({
        model,
        max_tokens: 200,
        messages: [{
            role:    'user',
            content: `Summarize this work item in 2-3 sentences. Focus on what it is and what needs to be done. Be concise and technical.\n\n` +
                     `Type: ${item.entityType}\nID: #${item.id}\nName: ${item.name}\nProject: ${item.projectName}\n` +
                     `Parent: ${item.parentName ?? 'N/A'}\nState: ${item.stateName}`,
        }],
    });

    const block = message.content[0];
    return block.type === 'text' ? block.text.trim() : '';
}

async function run(): Promise<void> {
    const updateKb = process.argv.includes('--update-kb');

    if (!updateKb) {
        console.log('Usage: tsx src/targetprocess/collector.ts --update-kb');
        process.exit(0);
    }

    const apiKey = process.env['CLAUDE_API_KEY'];
    if (!apiKey) {
        throw new Error('CLAUDE_API_KEY mancante in .env');
    }

    const anthropic = new Anthropic({ apiKey });
    const client    = new TargetprocessClient();

    console.log('Fetching assigned open items from TargetProcess...');
    const items = await client.getMyAssignedOpenItems();
    console.log(`Found ${items.length} open items.`);

    await fs.mkdir(KB_DIR, { recursive: true });
    const kb        = await loadKb();
    const kbMap     = new Map<number, KbEntry>(kb.items.map(e => [e.id, e]));
    let   updated   = 0;

    for (const item of items) {
        const existing = kbMap.get(item.id);

        // Skip if cached and name hasn't changed (no lastModifiedDate in current type)
        if (existing && existing.name === item.name) {
            continue;
        }

        console.log(`  Generating summary for #${item.id} — ${item.name}`);
        const summary = await generateSummary(item, anthropic);

        kbMap.set(item.id, {
            id:         item.id,
            entityType: item.entityType,
            name:       item.name,
            summary,
            cachedAt:   new Date().toISOString(),
        });
        updated++;
    }

    const store: KbStore = {
        updatedAt: new Date().toISOString(),
        items:     Array.from(kbMap.values()),
    };

    await fs.writeFile(KB_FILE, JSON.stringify(store, null, 2), 'utf-8');
    console.log(`KB updated: ${updated} new/changed entries. Total: ${store.items.length}. Written to ${KB_FILE}`);
}

run().catch((err: Error) => {
    console.error('Errore:', err.message);
    process.exit(1);
});
