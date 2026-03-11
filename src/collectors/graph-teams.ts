import * as fs   from 'fs/promises';
import * as path from 'path';
import type { Client } from '@microsoft/microsoft-graph-client';
import { mergeByKey, readMeta, writeMeta, shouldSkipMonth } from './utils';

const TEAMS_DIR = path.join(process.cwd(), 'data', 'raw', 'graph-teams');

export interface TeamsMessageRaw {
    id:                   string;
    chatId:               string;
    chatType:             string;
    chatTopic:            string | null;
    createdDateTime:      string;
    lastModifiedDateTime: string;
    from:                 unknown;
    body:                 { contentType: string; content: string };
    webUrl:               string | null;
    messageType:          string;
}

/** Fetch all available messages from all chats and split them into a month map. */
async function fetchAllMessages(
    client: Client,
    top:    number,
): Promise<Map<string, TeamsMessageRaw[]>> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;

    const chatsResponse = await c
        .api('/me/chats')
        .select('id,topic,chatType,lastUpdatedDateTime')
        .top(top)
        .get() as { value: Array<{ id: string; topic: string | null; chatType: string }> };

    const chats = chatsResponse.value ?? [];
    const byMonth = new Map<string, TeamsMessageRaw[]>();

    for (const chat of chats) {
        try {
            const messagesResponse = await c
                .api(`/me/chats/${chat.id}/messages`)
                .top(Math.min(top, 50))
                .get() as { value: TeamsMessageRaw[] };

            for (const m of messagesResponse.value ?? []) {
                const msg: TeamsMessageRaw = {
                    id:                   m.id,
                    chatId:               chat.id,
                    chatType:             chat.chatType,
                    chatTopic:            chat.topic,
                    createdDateTime:      m.createdDateTime,
                    lastModifiedDateTime: m.lastModifiedDateTime,
                    from:                 m.from,
                    body:                 m.body,
                    webUrl:               m.webUrl ?? null,
                    messageType:          m.messageType,
                };

                const month = m.createdDateTime?.slice(0, 7);
                if (!month) continue;

                if (!byMonth.has(month)) byMonth.set(month, []);
                byMonth.get(month)!.push(msg);
            }
        } catch {
            // Some chats may not be accessible; skip silently
        }
    }

    return byMonth;
}

export async function collectGraphTeams(
    client: Client,
    date?:  string,
    force = false,
): Promise<string[]> {
    const top   = Number(process.env['TOP'] ?? 50);
    const today = new Date().toISOString().slice(0, 10);

    await fs.mkdir(TEAMS_DIR, { recursive: true });

    const meta     = await readMeta(TEAMS_DIR);
    const outPaths: string[] = [];

    // Teams API does not support server-side date filtering on chat messages;
    // fetch all available messages and distribute by month.
    const byMonth = await fetchAllMessages(client, top);

    if (date) {
        // Single-day mode: update only the file for the month containing `date`
        const month          = date.slice(0, 7);
        const isCurrentMonth = month === today.slice(0, 7);
        const outPath        = path.join(TEAMS_DIR, `${month}.json`);

        if (!force && !isCurrentMonth && shouldSkipMonth(meta[month], month, ['graph'])) {
            console.log(`  [Teams] ${month}: skip`);
            return [outPath];
        }

        const newMsgs = (byMonth.get(month) ?? []).filter(m => m.createdDateTime?.startsWith(date));
        const merged  = await mergeByKey<TeamsMessageRaw>(outPath, newMsgs, 'id');
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), 'utf-8');
        await writeMeta(TEAMS_DIR, month, { lastExtractedDate: today, sources: ['graph'] });
        return [outPath];
    }

    // Full-range mode: write every month we received data for
    const months = Array.from(byMonth.keys()).sort();

    for (const month of months) {
        const isCurrentMonth = month === today.slice(0, 7);
        const outPath        = path.join(TEAMS_DIR, `${month}.json`);

        if (!force && !isCurrentMonth && shouldSkipMonth(meta[month], month, ['graph'])) {
            console.log(`  [Teams] ${month}: skip`);
            outPaths.push(outPath);
            continue;
        }

        const newMsgs = byMonth.get(month) ?? [];
        const merged  = await mergeByKey<TeamsMessageRaw>(outPath, newMsgs, 'id');
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), 'utf-8');
        await writeMeta(TEAMS_DIR, month, { lastExtractedDate: today, sources: ['graph'] });
        outPaths.push(outPath);
        console.log(`  [Teams] ${month}: ${newMsgs.length} messaggi`);
    }

    return outPaths;
}
