import * as fs from "node:fs/promises";
import * as path from "node:path";
import { execSync } from "node:child_process";
import { globSync } from "glob";
import { createLogger } from "../../logger";

import { mergeByKey, readMeta, writeMeta, shouldSkipMonth } from "../../utils";
import { GitCommitRaw } from "@shared/aggregator";
import {
  dateToString,
  currentMonthString,
  extractMonthStr,
  DateRange,
  parseDateString,
} from "@shared/dates";
import { CONFIG } from "@shared/env-config";
import { getJsonRawPath, writeJson } from "../../json-io";

const log = createLogger("vcs-git");
const GIT_DIR = getJsonRawPath("git");

function findGitRepos(root: string): string[] {
  try {
    const gitDirs = globSync("**/.git", {
      cwd: root,
      absolute: true,
      dot: true,
      maxDepth: 4,
      ignore: ["**/node_modules/**"],
    });
    return gitDirs.map((g) => path.dirname(g));
  } catch {
    return [];
  }
}

function getCommitsFromRepo(repoPath: string, since: Date, root?: string): GitCommitRaw[] {
  const SEP = "\x1F";
  const REC = "\x01"; // git emette SOH via %x01 — nessun null byte nella command string
  const fmt = `--format=%x01%H${SEP}%an${SEP}%ae${SEP}%ad${SEP}%s`;

  try {
    const out = execSync(
      `git log ${fmt} --name-only --date=short --since="${dateToString(since)}" --all`,
      { cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] },
    );

    return out
      .split(REC)
      .filter(Boolean)
      .flatMap((record) => {
        const lines = record.trim().split("\n").filter(Boolean);
        if (!lines[0]) return [];
        const [hash, author, email, date, ...msgParts] = lines[0].split(SEP);
        if (!date) return [];
        return [{
          hash: hash ?? "",
          author: author ?? "",
          email: email ?? "",
          date: parseDateString(date),
          message: msgParts.join(SEP).trim(),
          repo: root ? path.relative(root, repoPath).replace(/\\/g, "/") : path.basename(repoPath),
          paths: lines.slice(1),
        }];
      });
  } catch {
    return [];
  }
}

export async function collectGitCommits(
  range: DateRange | undefined,
  force = false,
): Promise<string[]> {
  const roots = (CONFIG.GIT_ROOTS)
    .map((r) => r.trim())
    .filter(Boolean);
  const gitEmails = (CONFIG.GIT_EMAILS)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const since = CONFIG.COLLECT_SINCE;
  const today = dateToString();

  if (roots.length === 0) {
    log.warn("GIT_ROOTS non configurato — collector Git saltato.");
    return [];
  }

  await fs.mkdir(GIT_DIR, { recursive: true });

  // Collect all commits across all repos
  const allCommits: GitCommitRaw[] = [];
  for (const root of roots) {
    const repos = findGitRepos(root);
    for (const repo of repos) {
      allCommits.push(...getCommitsFromRepo(repo, since, root));
    }
  }

  // Filter by author email when GIT_EMAILS is configured
  const filtered =
    gitEmails.length > 0
      ? allCommits.filter((c) => gitEmails.includes(c.email.toLowerCase()))
      : allCommits;

  // Group by month
  const byMonth = new Map<string, GitCommitRaw[]>();
  for (const commit of filtered) {
    const month = commit.date ? extractMonthStr(commit.date) : undefined;
    if (!month) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(commit);
  }

  const meta = await readMeta(GIT_DIR);
  const outPaths: string[] = [];
  const months = Array.from(byMonth.keys()).sort((a, b) => a.localeCompare(b));

  for (const month of months) {
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(GIT_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, roots)
    ) {
      log.info(`${month}: skip`);
      outPaths.push(outPath);
      continue;
    }

    const newCommits = byMonth.get(month) ?? [];
    const merged = await mergeByKey<GitCommitRaw>(outPath, newCommits, "hash");
    await writeJson(outPath, merged);
    await writeMeta(GIT_DIR, month, {
      lastExtractedDate: today,
      sources: roots,
    });
    outPaths.push(outPath);
    log.info(`${month}: ${newCommits.length} commit`);
  }

  return outPaths;
}
