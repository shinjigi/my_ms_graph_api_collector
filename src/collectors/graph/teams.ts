import * as fs   from 'fs/promises';
import * as path from 'path';
import type { Client } from '@microsoft/microsoft-graph-client';
import { mergeByKey, readMeta, writeMeta, shouldSkipMonth, lastDayOfMonth } from '../utils';

const TEAMS_DIR        = path.join(process.cwd(), 'data', 'raw', 'graph-teams');
const CHAT_STATES_FILE = path.join(TEAMS_DIR, 'chat-states.json');

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

interface ChatState {
    lastModifiedDateTime: string;   // ISO — fetch only messages newer than this
    topic:                string | null;
    chatType:             string;
}

async function loadChatStates(): Promise<Record<string, ChatState>> {
    try {
        const raw = await fs.readFile(CHAT_STATES_FILE, 'utf-8');
        return JSON.parse(raw) as Record<string, ChatState>;
    } catch {
        return {};
    }
}

async function saveChatStates(states: Record<string, ChatState>): Promise<void> {
    await fs.writeFile(CHAT_STATES_FILE, JSON.stringify(states, null, 2), 'utf-8');
}

/** Default since: 1 month ago from today. */
function oneMonthAgo(): string {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString();
}

/**
 * Fetch new/modified messages for a single chat using the server-side
 * $filter=lastModifiedDateTime gt <since> approach.
 * Returns messages sorted newest-first and the max lastModifiedDateTime seen.
 */
async function fetchChatMessagesSince(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    c:       any,
    chatId:  string,
    since:   string,
): Promise<{ messages: TeamsMessageRaw[]; maxLastModified: string }> {
    const messages: TeamsMessageRaw[] = [];
    let   maxLastModified = since;
    let   nextLink: string | null = null;

    do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = nextLink
            ? await c.api(nextLink).get()
            : await c
                .api(`/me/chats/${chatId}/messages`)
                .orderby('lastModifiedDateTime desc')
                .filter(`lastModifiedDateTime gt ${since}`)
                .top(50)
                .get();

        const page: TeamsMessageRaw[] = res.value ?? [];
        nextLink = res['@odata.nextLink'] ?? null;

        for (const m of page) {
            if (m.lastModifiedDateTime > maxLastModified) {
                maxLastModified = m.lastModifiedDateTime;
            }
        }

        messages.push(...page);
    } while (nextLink);

    return { messages, maxLastModified };
}

export async function collectGraphTeams(
    client: Client,
    date?:  string,
    force = false,
): Promise<string[]> {
    const today = new Date().toISOString().slice(0, 10);

    await fs.mkdir(TEAMS_DIR, { recursive: true });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;

    // Load per-chat incremental state
    const chatStates = await loadChatStates();

    // Enumerate all chats (paginate to get all 600+)
    const allChats: Array<{ id: string; topic: string | null; chatType: string }> = [];
    let   chatsNextLink: string | null = null;

    do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = chatsNextLink
            ? await c.api(chatsNextLink).get()
            : await c.api('/me/chats').select('id,topic,chatType,lastUpdatedDateTime').top(50).get();

        allChats.push(...(res.value ?? []));
        chatsNextLink = res['@odata.nextLink'] ?? null;
    } while (chatsNextLink);

    console.log(`  [Teams] ${allChats.length} chat trovate`);

    // Collect all new messages, grouped by month
    const byMonth = new Map<string, TeamsMessageRaw[]>();
    const updatedStates: Record<string, ChatState> = { ...chatStates };

    // In single-day mode narrow to the target month only for writing,
    // but still need to fetch from all chats.
    const targetMonth = date ? date.slice(0, 7) : null;

    for (const chat of allChats) {
        // Determine the since threshold for this chat
        const stored = chatStates[chat.id];
        const since  = force
            ? oneMonthAgo()
            : (stored?.lastModifiedDateTime ?? oneMonthAgo());

        try {
            const { messages, maxLastModified } = await fetchChatMessagesSince(c, chat.id, since);

            if (messages.length === 0) continue;

            for (const m of messages) {
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

                // In single-day mode only accumulate the relevant month
                if (targetMonth && month !== targetMonth) continue;

                if (!byMonth.has(month)) byMonth.set(month, []);
                byMonth.get(month)!.push(msg);
            }

            // Advance stored state for this chat
            updatedStates[chat.id] = {
                lastModifiedDateTime: maxLastModified,
                topic:                chat.topic,
                chatType:             chat.chatType,
            };
        } catch {
            // Inaccessible chats: skip silently
        }
    }

    // Write monthly files (merge by id)
    const meta     = await readMeta(TEAMS_DIR);
    const outPaths: string[] = [];
    const months   = Array.from(byMonth.keys()).sort();

    for (const month of months) {
        const outPath = path.join(TEAMS_DIR, `${month}.json`);
        const newMsgs = byMonth.get(month) ?? [];
        const merged  = await mergeByKey<TeamsMessageRaw>(outPath, newMsgs, 'id');
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), 'utf-8');
        await writeMeta(TEAMS_DIR, month, {
            lastExtractedDate: today,
            sources: ['graph'],
        });
        outPaths.push(outPath);
        console.log(`  [Teams] ${month}: +${newMsgs.length} messaggi (tot. ${merged.length})`);
    }

    // Persist updated per-chat states
    await saveChatStates(updatedStates);

    // Report months that already had no new messages
    const existingFiles = await fs.readdir(TEAMS_DIR).catch(() => [] as string[]);
    for (const f of existingFiles) {
        if (!/^\d{4}-\d{2}\.json$/.test(f)) continue;
        const month = f.replace('.json', '');
        if (!byMonth.has(month) && meta[month]) {
            console.log(`  [Teams] ${month}: skip (nessun nuovo messaggio)`);
            outPaths.push(path.join(TEAMS_DIR, f));
        }
    }

    return outPaths;
}
