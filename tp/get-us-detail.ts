import { TargetprocessClient } from './client';
import { printTable, parseTpDate, printJson, hasJsonFlag } from './format';
import type { TpTimeEntry } from './types';

const US_ID    = parseInt(process.argv[2] ?? '', 10);
const ASSIGNEE = process.argv[3] ?? null;  // optional: partial name match (case-insensitive)

if (!US_ID) {
    console.error('Usage: npm run tp:us-detail -- <usId> [assignee]');
    process.exit(1);
}

async function main(): Promise<void> {
    console.log(`--- Dettaglio US #${US_ID}${ASSIGNEE ? ` — filtro: "${ASSIGNEE}"` : ''} ---`);
    try {
        const client = new TargetprocessClient();

        const [us, allTimes] = await Promise.all([
            client.getUserStory(US_ID),
            client.getTimesByAssignable(US_ID),
        ]);

        console.log(`\n${us.Name}`);
        console.log(`Stato: ${us.EntityState?.Name ?? '-'}  |  Owner: ${us.Owner?.FullName ?? '-'}  |  Totale ore: ${us.TimeSpent ?? 0}h`);

        const entries: TpTimeEntry[] = ASSIGNEE
            ? allTimes.filter(t => t.User?.FullName?.toLowerCase().includes(ASSIGNEE.toLowerCase()))
            : allTimes;

        if (entries.length === 0) {
            console.log('\nNessuna registrazione ore trovata.');
            return;
        }

        if (hasJsonFlag()) {
            printJson({ us, entries });
            return;
        }

        console.log(`\n${entries.length} registrazioni:\n`);

        printTable<TpTimeEntry>(entries, [
            { header: 'DATA',        width: 12, value: t => parseTpDate(t.Date) },
            { header: 'UTENTE',      width: 28, value: t => t.User?.FullName ?? '-' },
            { header: 'ORE',         width: 6,  value: t => String(t.Spent ?? 0) },
            { header: 'DESCRIZIONE', width: 60, value: t => t.Description ?? '' },
        ]);

        // Totals per user
        const totals = new Map<string, number>();
        entries.forEach(t => {
            const name = t.User?.FullName ?? 'Unknown';
            totals.set(name, (totals.get(name) ?? 0) + (t.Spent ?? 0));
        });

        console.log('\n--- Totali per utente ---');
        [...totals.entries()]
            .sort(([, a], [, b]) => b - a)
            .forEach(([name, hrs]) => console.log(`  ${name.padEnd(28)} ${hrs.toFixed(1)}h`));

        const grandTotal = [...totals.values()].reduce((s, v) => s + v, 0);
        console.log(`${'  TOTALE'.padEnd(30)} ${grandTotal.toFixed(1)}h`);

        console.log('\n--- Fine ---');
    } catch (error) {
        console.error('\nErrore durante l\'esecuzione:');
        console.error(error instanceof Error ? error.message : error);
        process.exit(1);
    }
}

main();
