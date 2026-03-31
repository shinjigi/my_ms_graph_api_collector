import * as fs from "fs/promises";
import * as path from "path";
import { execSync } from "child_process";
import { globSync } from "glob";
import { mergeByKey, readMeta, writeMeta, shouldSkipMonth } from "../utils";
import { GitCommit } from "@shared/aggregator";
import { dateToString, currentMonthString, extractMonthStr } from "@shared/dates";

const GIT_DIR = path.join(process.cwd(), "data", "raw", "git");

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

function getCommitsFromRepo(repoPath: string, since: string): GitCommit[] {
  const SEP = "\x1F";
  const REC = "\x1E";
  const fmt = `--format=%H${SEP}%an${SEP}%ae${SEP}%ad${SEP}%s${REC}`;

  try {
    const out = execSync(
      `git log ${fmt} --date=short --since="${since}" --all`,
      { cwd: repoPath, encoding: "utf-8", stdio: ["pipe", "pipe", "ignore"] },
    );

    return out
      .split(REC)
      .map((r) => r.trim())
      .filter((r) => r.length > 0)
      .map((r) => {
        const [hash, author, email, date, ...msgParts] = r.split(SEP);
        return {
          hash: hash ?? "",
          author: author ?? "",
          email: email ?? "",
          date: date ?? "",
          message: msgParts.join(SEP).trim(),
          repo: path.basename(repoPath),
        };
      });
  } catch {
    return [];
  }
}

export async function collectGitCommits(force = false): Promise<string[]> {
  const roots = (process.env["GIT_ROOTS"] ?? "")
    .split(";")
    .map((r) => r.trim())
    .filter(Boolean);
  const gitEmails = (process.env["GIT_EMAILS"] ?? "")
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const since = process.env["COLLECT_SINCE"] ?? "2025-01-01";
  const today = dateToString();

  if (roots.length === 0) {
    console.warn("GIT_ROOTS non configurato — collector Git saltato.");
    return [];
  }

  await fs.mkdir(GIT_DIR, { recursive: true });

  // Collect all commits across all repos
  const allCommits: GitCommit[] = [];
  for (const root of roots) {
    const repos = findGitRepos(root);
    for (const repo of repos) {
      allCommits.push(...getCommitsFromRepo(repo, since));
    }
  }

  // Filter by author email when GIT_EMAILS is configured
  const filtered =
    gitEmails.length > 0
      ? allCommits.filter((c) => gitEmails.includes(c.email.toLowerCase()))
      : allCommits;

  // Group by month
  const byMonth = new Map<string, GitCommit[]>();
  for (const commit of filtered) {
    const month = commit.date ? extractMonthStr(commit.date) : undefined;
    if (!month) continue;
    if (!byMonth.has(month)) byMonth.set(month, []);
    byMonth.get(month)!.push(commit);
  }

  const meta = await readMeta(GIT_DIR);
  const outPaths: string[] = [];
  const months = Array.from(byMonth.keys()).sort();

  for (const month of months) {
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(GIT_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, roots)
    ) {
      console.log(`  [Git] ${month}: skip`);
      outPaths.push(outPath);
      continue;
    }

    const newCommits = byMonth.get(month) ?? [];
    const merged = await mergeByKey<GitCommit>(outPath, newCommits, "hash");
    await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
    await writeMeta(GIT_DIR, month, {
      lastExtractedDate: today,
      sources: roots,
    });
    outPaths.push(outPath);
    console.log(`  [Git] ${month}: ${newCommits.length} commit`);
  }

  return outPaths;
}
