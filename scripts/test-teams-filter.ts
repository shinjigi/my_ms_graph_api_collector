/**
 * Test: fetch Teams messages using $filter=lastModifiedDateTime gt <since>
 * combined with $orderby=lastModifiedDateTime desc (required by the API).
 * Usage: npx tsx scripts/test-teams-filter.ts [YYYY-MM-DD]
 */
import * as dotenv from 'dotenv';
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGraphClient } = require('../src/graphClient') as {
    createGraphClient: () => Promise<import('@microsoft/microsoft-graph-client').Client>;
};

const since = process.argv[2] ?? '2026-03-01';

async function run(): Promise<void> {
    console.log(`\nTest $filter lastModifiedDateTime gt ${since}\n`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c = await createGraphClient() as any;

    // Use the standup chat identified in the previous test
    const chatId = '19:meeting_Y2U2N2IyZTQtMWM3NS00MWI3LWJkMTYtM2M3ODYyN2RmYzA2@thread.v2';

    console.log(`Chat: stand up (${chatId})`);
    console.log(`Filtro: lastModifiedDateTime gt ${since}T00:00:00Z\n`);

    let page       = 0;
    let total      = 0;
    let nextLink: string | null = null;

    do {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res: any = nextLink
            ? await c.api(nextLink).get()
            : await c
                .api(`/me/chats/${chatId}/messages`)
                .orderby('lastModifiedDateTime desc')
                .filter(`lastModifiedDateTime gt ${since}T00:00:00Z`)
                .top(50)
                .get();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const msgs: any[] = res.value ?? [];
        nextLink = res['@odata.nextLink'] ?? null;
        page++;
        total += msgs.length;

        const newest = msgs[0]?.lastModifiedDateTime?.slice(0, 19);
        const oldest = msgs.at(-1)?.lastModifiedDateTime?.slice(0, 19);
        console.log(`Pagina ${page}: ${msgs.length} msg  [${oldest} … ${newest}]`);

        // Print non-system messages
        for (const m of msgs) {
            if (m.messageType === 'unknownFutureValue') continue;
            const text = (m.body?.content ?? '')
                .replace(/<[^>]+>/g, '')
                .replace(/\s+/g, ' ')
                .trim()
                .slice(0, 100);
            console.log(`  ${m.createdDateTime?.slice(0, 19)} | ${m.messageType} | ${text}`);
        }
    } while (nextLink);

    console.log(`\nTotale messaggi ricevuti dall'API: ${total}`);
    console.log(`(Atteso: tutti i messaggi con lastModifiedDateTime > ${since})`);
}

run().catch((err: Error) => {
    console.error('Errore:', err.message);
    process.exit(1);
});
