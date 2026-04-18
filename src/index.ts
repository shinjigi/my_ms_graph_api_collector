/**
 * Main entrypoint for "npm run collect".
 * Runs all collectors sequentially and writes raw data to data/raw/.
 */
import { createLogger } from "./logger";

const log = createLogger("collect");

import { createGraphClient } from "./graphClient";

import { collectGraphCalendar } from "./collectors/graph/calendar";
import { collectGraphEmail } from "./collectors/graph/email";
import { collectGraphTeams } from "./collectors/graph/teams";
import { collectSvnCommits } from "./collectors/vcs/svn";
import { collectGitCommits } from "./collectors/vcs/git";
import { collectZucchetti } from "./collectors/zucchetti/index";
import { collectNibol } from "./collectors/nibol/index";
import { collectBrowserHistory } from "./collectors/browser/history";
import { runAggregation } from "./aggregators/aggregator";
import { DateRange, lastDayOfMonth, parseDateString } from "@shared/dates";
import { endOfDay } from "date-fns";
import { CONFIG } from "@shared/env-config";

async function run(): Promise<void> {
    const forceFlag   = process.argv.includes("--force");
    const aggregateFlag = process.argv.includes("--aggregate");
    const dateArg   = process.argv.find((a) => a.startsWith("--date="))?.split("=")[1];
    const startArg  = process.argv.find((a) => a.startsWith("--start="))?.split("=")[1];
    const endArg    = process.argv.find((a) => a.startsWith("--end="))?.split("=")[1];
    const sourceArg = process.argv.find((a) => a.startsWith("--source="))?.split("=")[1]?.toLowerCase();
    const yearArg   = process.argv.find((a) => a.startsWith("--year="))?.split("=")[1];
    const monthArg  = process.argv.find((a) => a.startsWith("--month="))?.split("=")[1];

    // range is defined only when explicit args are provided.
    // Without args, collectors use their own full-range mode (COLLECT_SINCE → today, per-month files).
    let range: DateRange | undefined;

    if (startArg && endArg) {
        range = { start: parseDateString(startArg), end: parseDateString(endArg) };
    } else if (dateArg) {
        const d = parseDateString(dateArg);
        range = { start: d, end: endOfDay(d) };
    } else if (yearArg && monthArg) {
        const start = parseDateString(`${yearArg}-${monthArg.padStart(2, "0")}-01`);
        range = { start, end: lastDayOfMonth(start) };
    }

    const shouldRun = (name: string) => !sourceArg || sourceArg === name;

    log.info(
        "Avvio raccolta dati" +
            (range ? ` (Range: ${range.start.toLocaleDateString()} → ${range.end.toLocaleDateString()})` : ` (Full: ${CONFIG.COLLECT_SINCE} → oggi)`) +
            (sourceArg ? ` [Sorgente: ${sourceArg}]` : "") +
            (forceFlag ? " [--force]" : ""),
    );

    // Microsoft Graph collectors
    const requiresGraph = shouldRun("calendar") || shouldRun("email") || shouldRun("teams");
    if (requiresGraph) {
        log.info("[Graph] Autenticazione...");
        const client = await createGraphClient();

        if (shouldRun("calendar")) {
            const calPaths = await collectGraphCalendar(client, range, forceFlag);
            calPaths.forEach((p) => log.info(`[Graph] Calendario → ${p}`));
        }

        if (shouldRun("email")) {
            const emailPaths = await collectGraphEmail(client, range, forceFlag);
            emailPaths.forEach((p) => log.info(`[Graph] Email → ${p}`));
        }

        if (shouldRun("teams")) {
            const teamsPaths = await collectGraphTeams(client, range, forceFlag);
            teamsPaths.forEach((p) => log.info(`[Graph] Teams → ${p}`));
        }
    }

    if (shouldRun("svn")) {
        log.info("[SVN] Raccolta commit...");
        const svnPaths = await collectSvnCommits(range, forceFlag);
        svnPaths.forEach((p) => log.info(`[SVN] Commit → ${p}`));
    }

    if (shouldRun("git")) {
        log.info("[Git] Raccolta commit...");
        const gitPaths = await collectGitCommits(range, forceFlag);
        gitPaths.forEach((p) => log.info(`[Git] Commit → ${p}`));
    }

    if (shouldRun("zucchetti")) {
        log.info("[Zucchetti] Raccolta cartellino...");
        const zuccPaths = await collectZucchetti(range, forceFlag);
        zuccPaths.forEach((p) => log.info(`[Zucchetti] → ${p}`));
    }

    if (shouldRun("nibol")) {
        log.info("[Nibol] Raccolta calendario...");
        const nibolPaths = await collectNibol(range, forceFlag);
        nibolPaths.forEach((p) => log.info(`[Nibol] → ${p}`));
    }

    if (shouldRun("browser")) {
        log.info("[Browser] Raccolta cronologia...");
        const browserPaths = await collectBrowserHistory(range, forceFlag);
        browserPaths.forEach((p) => log.info(`[Browser] → ${p}`));
    }

    log.info("Raccolta completata.");

    if (aggregateFlag) {
        log.info("[Aggregator] Avvio aggregazione automatica...");
        try {
            await runAggregation();
        } catch (aggErr) {
            log.error(`Errore durante l'aggregazione automatica: ${(aggErr as Error).message}`);
        }
    }
}

run().catch((error: Error) => {
    log.error(`Errore durante la raccolta: ${error.message}`);
    process.exit(1);
});
