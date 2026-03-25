import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { parseString } from "xml2js";
import {
  mergeByKey,
  readMeta,
  writeMeta,
  shouldSkipMonth,
  lastDayOfMonth,
} from "../utils";
import { SvnCommit } from "@shared/aggregator";

function parseXml(xml: string): Promise<unknown> {
  return new Promise((resolve, reject) =>
    parseString(xml, { trim: false, normalize: false }, (err, result) =>
      err ? reject(err) : resolve(result),
    ),
  );
}
const SVN_DIR = path.join(process.cwd(), "data", "raw", "svn");

function runSvn(args: string[], svnBin: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const proc = spawn(svnBin, args, { env: { ...process.env } });

    proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    proc.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
    proc.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`svn exited with code ${code}`));
      } else {
        resolve(Buffer.concat(chunks).toString("utf-8"));
      }
    });
    proc.on("error", reject);
  });
}

async function fetchMonthCommits(
  month: string,
  svnUrl: string,
  svnBin: string,
  user?: string,
  pass?: string,
  authorFilter?: string,
): Promise<SvnCommit[]> {
  const lastDay = lastDayOfMonth(month);
  // --with-all-revprops ensures the server sends full revprop values (incl. full commit messages)
  const args = [
    "log",
    "--xml",
    "--with-all-revprops",
    "-r",
    `{${month}-01}:{${lastDay}}`,
  ];

  if (user && pass) {
    args.push("--username", user, "--password", pass, "--no-auth-cache");
  }

  args.push(svnUrl);

  const xmlOutput = await runSvn(args, svnBin);

  interface SvnLogEntry {
    $: { revision: string };
    author?: string[];
    date?: string[];
    msg?: string[];
    paths?: Array<{ path: Array<{ _: string }> }>;
  }
  interface SvnXmlParsed {
    log?: { logentry?: SvnLogEntry[] };
  }

  const parsed = (await parseXml(xmlOutput)) as SvnXmlParsed;
  const entries: SvnLogEntry[] = parsed?.log?.logentry ?? [];

  const commits: SvnCommit[] = entries.flatMap((e) => {
    const rawDate = (e.date ?? [])[0] ?? "";
    const d = new Date(rawDate);
    if (Number.isNaN(d.getTime())) return []; // property-change or merge-tracking entries have no date
    return [
      {
        revision: e.$.revision,
        author: (e.author ?? [""])[0],
        date: d.toISOString().slice(0, 10),
        message: ((e.msg ?? [""])[0] ?? "").trim(),
        paths: (e.paths?.[0]?.path ?? []).map((p: { _: string }) => p._),
      },
    ];
  });

  // Filter to only commits by the configured author
  if (authorFilter) {
    return commits.filter((c) => c.author === authorFilter);
  }

  return commits;
}

export async function collectSvnCommits(force = false): Promise<string[]> {
  const svnUrl = process.env["SVN_URL"];
  const svnBin = process.env["SVN_BIN"] ?? "svn";
  const since = process.env["COLLECT_SINCE"] ?? "2025-01-01";
  const user = process.env["SVN_USERNAME"];
  const pass = process.env["SVN_PASSWORD"];
  const today = new Date().toISOString().slice(0, 10);

  if (!svnUrl) {
    console.warn("SVN_URL non configurato — collector SVN saltato.");
    return [];
  }

  await fs.mkdir(SVN_DIR, { recursive: true });

  const meta = await readMeta(SVN_DIR);
  const outPaths: string[] = [];
  const sources = [svnUrl];

  const sinceDate = new Date(since);
  let current = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
  const now = new Date();

  while (current <= now) {
    const year = current.getFullYear();
    const mo = current.getMonth() + 1;
    const month = `${year}-${String(mo).padStart(2, "0")}`;
    const isCurrentMonth = month === today.slice(0, 7);
    const outPath = path.join(SVN_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, sources)
    ) {
      console.log(`  [SVN] ${month}: skip`);
      outPaths.push(outPath);
    } else {
      try {
        const commits = await fetchMonthCommits(
          month,
          svnUrl,
          svnBin,
          user,
          pass,
          user,
        );
        const merged = await mergeByKey<SvnCommit>(
          outPath,
          commits,
          "revision",
        );
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
        await writeMeta(SVN_DIR, month, { lastExtractedDate: today, sources });
        outPaths.push(outPath);
        console.log(`  [SVN] ${month}: ${commits.length} commit`);
      } catch (err) {
        console.warn(
          `  [SVN] ${month}: ${(err as Error).message}. Mese saltato.`,
        );
        // Write empty file so the month is not retried on next run if already past
        if (!isCurrentMonth) {
          try {
            await fs.writeFile(outPath, "[]", "utf-8");
            await writeMeta(SVN_DIR, month, {
              lastExtractedDate: today,
              sources,
            });
            outPaths.push(outPath);
          } catch {
            // Ignore write errors
          }
        }
      }
    }

    current = new Date(year, mo, 1);
  }

  return outPaths;
}
