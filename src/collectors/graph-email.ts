import * as fs   from 'fs/promises';
import * as path from 'path';
import type { Client } from '@microsoft/microsoft-graph-client';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

export interface EmailRaw {
    id:                  string;
    subject:             string;
    from:                { emailAddress: { name: string; address: string } } | null;
    receivedDateTime:    string;
    bodyPreview:         string;
    webLink:             string;
}

export async function collectGraphEmail(client: Client): Promise<string> {
    const since   = process.env['COLLECT_SINCE'] ?? '2025-01-01';
    const top     = Number(process.env['TOP'] ?? 500);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = client as any;
    const response = await c
        .api('/me/messages')
        .filter(`receivedDateTime ge ${since}T00:00:00Z`)
        .select('id,subject,from,receivedDateTime,bodyPreview,webLink')
        .orderby('receivedDateTime desc')
        .top(top)
        .get() as { value: EmailRaw[] };

    const emails: EmailRaw[] = response.value ?? [];

    await fs.mkdir(RAW_DIR, { recursive: true });
    const outPath = path.join(RAW_DIR, 'graph-emails.json');
    await fs.writeFile(outPath, JSON.stringify(emails, null, 2), 'utf-8');
    return outPath;
}
