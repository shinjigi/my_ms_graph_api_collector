import * as fs   from 'fs/promises';
import * as path from 'path';
import type { Client } from '@microsoft/microsoft-graph-client';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

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

export async function collectGraphTeams(client: Client): Promise<string> {
    const top = Number(process.env['TOP'] ?? 50);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;

    const chatsResponse = await c
        .api('/me/chats')
        .select('id,topic,chatType,lastUpdatedDateTime')
        .top(top)
        .get() as { value: Array<{ id: string; topic: string | null; chatType: string }> };

    const chats   = chatsResponse.value ?? [];
    const messages: TeamsMessageRaw[] = [];

    for (const chat of chats) {
        try {
            const messagesResponse = await c
                .api(`/me/chats/${chat.id}/messages`)
                .top(Math.min(top, 50))
                .get() as { value: TeamsMessageRaw[] };

            const simplified = (messagesResponse.value ?? []).map(m => ({
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
            }));

            messages.push(...simplified);
        } catch {
            // Some chats may not be accessible; skip silently
        }
    }

    await fs.mkdir(RAW_DIR, { recursive: true });
    const outPath = path.join(RAW_DIR, 'graph-teams-messages.json');
    await fs.writeFile(outPath, JSON.stringify(messages, null, 2), 'utf-8');
    return outPath;
}
