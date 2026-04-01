/**
 * Main entrypoint for "npm run collect".
 * Runs all collectors sequentially and writes raw data to data/raw/.
 */
import * as dotenv from "dotenv";
dotenv.config();

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

async function run(): Promise<void> {
  const forceFlag = process.argv.includes("--force");
  const dateArg = process.argv
    .find((a) => a.startsWith("--date="))
    ?.split("=")[1];
  const startArg = process.argv
    .find((a) => a.startsWith("--start="))
    ?.split("=")[1];
  const endArg = process.argv
    .find((a) => a.startsWith("--end="))
    ?.split("=")[1];
  const sourceArg = process.argv
    .find((a) => a.startsWith("--source="))
    ?.split("=")[1]?.toLowerCase();

  const range =
    startArg && endArg ? { start: startArg, end: endArg } : undefined;

  const shouldRun = (name: string) => !sourceArg || sourceArg === name;

  log.info(
    "Avvio raccolta dati" +
      (dateArg ? ` (giorno: ${dateArg})` : "") +
      (sourceArg ? ` [solo: ${sourceArg}]` : "") +
      (forceFlag ? " [--force]" : ""),
  );

  // Microsoft Graph collectors
  const requiresGraph = shouldRun("calendar") || shouldRun("email") || shouldRun("teams");
  if (requiresGraph) {
    log.info("[Graph] Autenticazione...");
    const client = await createGraphClient();

    if (shouldRun("calendar")) {
      const calPaths = await collectGraphCalendar(client, dateArg, forceFlag);
      calPaths.forEach((p) => log.info(`[Graph] Calendario → ${p}`));
    }

    if (shouldRun("email")) {
      const emailPaths = await collectGraphEmail(client, dateArg, forceFlag);
      emailPaths.forEach((p) => log.info(`[Graph] Email → ${p}`));
    }

    if (shouldRun("teams")) {
      const teamsPaths = await collectGraphTeams(client, dateArg, forceFlag);
      teamsPaths.forEach((p) => log.info(`[Graph] Teams → ${p}`));
    }
  }

  // SVN commits
  if (shouldRun("svn")) {
    log.info("[SVN] Raccolta commit...");
    const svnPaths = await collectSvnCommits(forceFlag);
    svnPaths.forEach((p) => log.info(`[SVN] Commit → ${p}`));
  }

  // Git commits
  if (shouldRun("git")) {
    log.info("[Git] Raccolta commit...");
    const gitPaths = await collectGitCommits(forceFlag);
    gitPaths.forEach((p) => log.info(`[Git] Commit → ${p}`));
  }

  if (shouldRun("zucchetti")) {
    log.info("[Zucchetti] Raccolta cartellino...");
    const zuccPaths = await collectZucchetti(forceFlag, range);
    zuccPaths.forEach((p) => log.info(`[Zucchetti] → ${p}`));
  }

  // Nibol calendar
  if (shouldRun("nibol")) {
    log.info("[Nibol] Raccolta calendario...");
    const nibolPaths = await collectNibol(forceFlag, range);
    nibolPaths.forEach((p) => log.info(`[Nibol] → ${p}`));
  }

  // Browser history (Chrome + Firefox)
  if (shouldRun("browser")) {
    log.info("[Browser] Raccolta cronologia...");
    const browserPaths = await collectBrowserHistory(forceFlag);
    browserPaths.forEach((p) => log.info(`[Browser] → ${p}`));
  }

  log.info("Raccolta completata.");
}

run().catch((error: Error) => {
  log.error(`Errore durante la raccolta: ${error.message}`);
  process.exit(1);
});
