/**
 * Main entrypoint for "npm run collect".
 * Runs all collectors sequentially and writes raw data to data/raw/.
 */
import * as dotenv from 'dotenv';
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGraphClient } = require('./graphClient') as {
    createGraphClient: () => Promise<import('@microsoft/microsoft-graph-client').Client>;
};

import { collectGraphCalendar } from './collectors/graph-calendar';
import { collectGraphEmail }    from './collectors/graph-email';
import { collectGraphTeams }    from './collectors/graph-teams';
import { collectSvnCommits }    from './collectors/svn-commits';
import { collectGitCommits }    from './collectors/git-commits';
import { collectZucchetti }     from './collectors/zucchetti';

async function run(): Promise<void> {
    const dateArg = process.argv.find(a => a.startsWith('--date='))?.split('=')[1];

    console.log('Avvio raccolta dati...' + (dateArg ? ` (giorno: ${dateArg})` : ''));

    // Microsoft Graph collectors (require device code auth on first run)
    console.log('\n[Graph] Autenticazione...');
    const client = await createGraphClient();

    const calPath = await collectGraphCalendar(client, dateArg);
    console.log(`[Graph] Calendario → ${calPath}`);

    const emailPath = await collectGraphEmail(client, dateArg);
    console.log(`[Graph] Email → ${emailPath}`);

    const teamsPath = await collectGraphTeams(client, dateArg);
    console.log(`[Graph] Teams → ${teamsPath}`);

    // SVN commits
    const svnPath = await collectSvnCommits();
    console.log(`[SVN] Commit → ${svnPath}`);

    // Git commits
    const gitPath = await collectGitCommits();
    console.log(`[Git] Commit → ${gitPath}`);

    // Zucchetti timesheet (collects from COLLECT_SINCE month by month)
    console.log('\n[Zucchetti] Raccolta cartellino...');
    const zuccPaths = await collectZucchetti();
    zuccPaths.forEach(p => console.log(`[Zucchetti] → ${p}`));

    console.log('\nRaccolta completata ✅');
}

run().catch((error: Error) => {
    console.error('Errore durante la raccolta:', error.message);
    process.exit(1);
});
