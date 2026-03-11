import * as dotenv from 'dotenv';
dotenv.config();
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGraphClient } = require('../src/graphClient') as { createGraphClient: () => Promise<unknown> };

const chatId = '19:meeting_Y2U2N2IyZTQtMWM3NS00MWI3LWJkMTYtM2M3ODYyN2RmYzA2@thread.v2';
const target = '2026-03-05';

async function run(): Promise<void> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = await createGraphClient() as any;
    let page = 0;
    let nextLink: string | null = null;
    let found = 0;

    do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = nextLink
            ? await c.api(nextLink).get()
            : await c.api(`/me/chats/${chatId}/messages`).top(50).get();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msgs: any[] = res.value ?? [];
        nextLink = res['@odata.nextLink'] ?? null;
        page++;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const onDay = msgs.filter((m: any) => m.createdDateTime?.startsWith(target));
        found += onDay.length;

        const oldest = msgs.at(-1)?.createdDateTime?.slice(0, 10);
        console.log(`Pagina ${page}: ${msgs.length} msg, oldest=${oldest}, trovati il ${target}: ${onDay.length}`);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        onDay.forEach((m: any) => {
            const text = (m.body?.content ?? '').replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim().slice(0, 120);
            console.log(`  ${m.createdDateTime?.slice(11, 19)} | ${text}`);
        });

        if (oldest && oldest < target) break;
        if (page >= 20) break;
    } while (nextLink);

    console.log(`\nTotale messaggi trovati per ${target}: ${found}`);
}

run().catch(console.error);
