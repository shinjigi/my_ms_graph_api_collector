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
import { collectBrowserHistory } from './collectors/browser-history';

async function run(): Promise<void> {
    const forceFlag = process.argv.includes('--force');
    const dateArg   = process.argv.find(a => a.startsWith('--date='))?.split('=')[1];

    console.log(
        'Avvio raccolta dati...' +
        (dateArg ? ` (giorno: ${dateArg})` : '') +
        (forceFlag ? ' [--force]' : '')
    );

    // Microsoft Graph collectors (require device code auth on first run)
    console.log('\n[Graph] Autenticazione...');
    const client = await createGraphClient();

    const calPaths = await collectGraphCalendar(client, dateArg, forceFlag);
    calPaths.forEach(p => console.log(`[Graph] Calendario → ${p}`));

    const emailPaths = await collectGraphEmail(client, dateArg, forceFlag);
    emailPaths.forEach(p => console.log(`[Graph] Email → ${p}`));

    const teamsPaths = await collectGraphTeams(client, dateArg, forceFlag);
    teamsPaths.forEach(p => console.log(`[Graph] Teams → ${p}`));

    // SVN commits
    console.log('\n[SVN] Raccolta commit...');
    const svnPaths = await collectSvnCommits(forceFlag);
    svnPaths.forEach(p => console.log(`[SVN] Commit → ${p}`));

    // Git commits
    console.log('\n[Git] Raccolta commit...');
    const gitPaths = await collectGitCommits(forceFlag);
    gitPaths.forEach(p => console.log(`[Git] Commit → ${p}`));

    // Zucchetti timesheet (collects from COLLECT_SINCE month by month)
    console.log('\n[Zucchetti] Raccolta cartellino...');
    const zuccPaths = await collectZucchetti(forceFlag);
    zuccPaths.forEach(p => console.log(`[Zucchetti] → ${p}`));

    // Browser history (Chrome + Firefox)
    console.log('\n[Browser] Raccolta cronologia...');
    const browserPaths = await collectBrowserHistory(forceFlag);
    browserPaths.forEach(p => console.log(`[Browser] → ${p}`));

    console.log('\nRaccolta completata ✅');
}

run().catch((error: Error) => {
    console.error('Errore durante la raccolta:', error.message);
    process.exit(1);
});
