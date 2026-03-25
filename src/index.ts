/**
 * Main entrypoint for "npm run collect".
 * Runs all collectors sequentially and writes raw data to data/raw/.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { createLogger } from './logger';

const log = createLogger('collect');

 
const { createGraphClient } = require('./graphClient') as {
    createGraphClient: () => Promise<import('@microsoft/microsoft-graph-client').Client>;
};

import { collectGraphCalendar } from './collectors/graph/calendar';
import { collectGraphEmail }    from './collectors/graph/email';
import { collectGraphTeams }    from './collectors/graph/teams';
import { collectSvnCommits }    from './collectors/vcs/svn';
import { collectGitCommits }    from './collectors/vcs/git';
import { collectZucchetti }     from './collectors/zucchetti/index';
import { collectBrowserHistory } from './collectors/browser/history';

async function run(): Promise<void> {
    const forceFlag = process.argv.includes('--force');
    const dateArg   = process.argv.find(a => a.startsWith('--date='))?.split('=')[1];

    log.info(
        'Avvio raccolta dati' +
        (dateArg ? ` (giorno: ${dateArg})` : '') +
        (forceFlag ? ' [--force]' : '')
    );

    // Microsoft Graph collectors (require device code auth on first run)
    log.info('[Graph] Autenticazione...');
    const client = await createGraphClient();

    const calPaths = await collectGraphCalendar(client, dateArg, forceFlag);
    calPaths.forEach(p => log.info(`[Graph] Calendario → ${p}`));

    const emailPaths = await collectGraphEmail(client, dateArg, forceFlag);
    emailPaths.forEach(p => log.info(`[Graph] Email → ${p}`));

    const teamsPaths = await collectGraphTeams(client, dateArg, forceFlag);
    teamsPaths.forEach(p => log.info(`[Graph] Teams → ${p}`));

    // SVN commits
    log.info('[SVN] Raccolta commit...');
    const svnPaths = await collectSvnCommits(forceFlag);
    svnPaths.forEach(p => log.info(`[SVN] Commit → ${p}`));

    // Git commits
    log.info('[Git] Raccolta commit...');
    const gitPaths = await collectGitCommits(forceFlag);
    gitPaths.forEach(p => log.info(`[Git] Commit → ${p}`));

    // Zucchetti timesheet (collects from COLLECT_SINCE month by month)
    log.info('[Zucchetti] Raccolta cartellino...');
    const zuccPaths = await collectZucchetti(forceFlag);
    zuccPaths.forEach(p => log.info(`[Zucchetti] → ${p}`));

    // Browser history (Chrome + Firefox)
    log.info('[Browser] Raccolta cronologia...');
    const browserPaths = await collectBrowserHistory(forceFlag);
    browserPaths.forEach(p => log.info(`[Browser] → ${p}`));

    log.info('Raccolta completata.');
}

run().catch((error: Error) => {
    log.error(`Errore durante la raccolta: ${error.message}`);
    process.exit(1);
});
