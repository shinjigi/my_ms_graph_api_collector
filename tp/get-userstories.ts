import { TargetprocessClient } from './client';
import { printTable, parseTpDate, printJson, hasJsonFlag } from './format';
import type { TpUserStory } from './types';

const PROJECT_ID = parseInt(process.argv[2] ?? '', 10);
const FROM_DATE  = process.argv[3] ?? undefined;  // optional: YYYY-MM-DD

if (!PROJECT_ID) {
    console.error('Usage: npm run tp:userstories -- <projectId> [YYYY-MM-DD]');
    process.exit(1);
}

async function main(): Promise<void> {
    const label = FROM_DATE ? ` dal ${FROM_DATE}` : '';
    console.log(`--- User Stories: project ${PROJECT_ID}${label} ---`);
    try {
        const client  = new TargetprocessClient();
        const stories = await client.getUserStoriesByProject(PROJECT_ID, { fromDate: FROM_DATE });

        if (stories.length === 0) {
            console.log('Nessuna user story trovata.');
            return;
        }

        if (hasJsonFlag()) {
            printJson(stories);
            return;
        }

        console.log(`\nFound ${stories.length} user stories:\n`);

        printTable<TpUserStory>(stories, [
            { header: 'ID',        width: 8,  value: s => String(s.Id) },
            { header: 'APERTURA',  width: 12, value: s => parseTpDate(s.CreateDate) },
            { header: 'CHIUSURA',  width: 12, value: s => parseTpDate(s.EndDate) },
            { header: 'STATO',     width: 20, value: s => s.EntityState?.Name  ?? '-' },
            { header: 'PRIORITÀ',  width: 14, value: s => s.Priority?.Name     ?? '-' },
            { header: 'OWNER',     width: 25, value: s => s.Owner?.FullName    ?? '-' },
            { header: 'ASSIGNEES', width: 50, value: s => (s.Assignments?.Items ?? [])
                .map(a => a.GeneralUser?.FullName)
                .filter(Boolean)
                .join(', ') },
            { header: 'NOME',      width: 60, value: s => s.Name },
        ]);

        console.log('\n--- Fine Estrazione ---');
    } catch (error) {
        console.error('\nErrore durante l\'esecuzione:');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main();
