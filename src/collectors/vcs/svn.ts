import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { parseString } from "xml2js";
import { createLogger } from "../../logger";

import { mergeByKey, readMeta, writeMeta } from "../../utils";
import { SvnCommitRaw } from "@shared/aggregator";
import { dateToString, currentMonthString, lastDayOfMonth, DateRange } from "@shared/dates";
import { CONFIG } from "@shared/env-config";
import { getJsonRawPath } from "../../json-io";

const log = createLogger("vcs-svn");

function parseXml(xml: string): Promise<unknown> {
    return new Promise((resolve, reject) =>
        parseString(xml, { trim: false, normalize: false }, (err, result) =>
            err ? reject(err) : resolve(result),
        ),
    );
}
const SVN_DIR = getJsonRawPath("svn");

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
): Promise<SvnCommitRaw[]> {
    const lastDay = lastDayOfMonth(month);
    // --with-all-revprops ensures the server sends full revprop values (incl. full commit messages)
    const args = ["log", "--xml", "--with-all-revprops", "-r", `{${month}-01}:{${lastDay}}`];

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

    const commits: SvnCommitRaw[] = entries.flatMap((e) => {
        const rawDate = (e.date ?? [])[0] ?? "";
        const d = new Date(rawDate);
        if (Number.isNaN(d.getTime())) return []; // property-change or merge-tracking entries have no date
        return [
            {
                revision: e.$.revision,
                author: (e.author ?? [""])[0],
                date: dateToString(rawDate),
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

export async function collectSvnCommits(range: DateRange, force = false): Promise<string[]> {
    const svnUrl = CONFIG.SVN_URL;
    const svnBin = CONFIG.SVN_BIN;
    const user = CONFIG.SVN_USERNAME;
    const pass = CONFIG.SVN_PASSWORD;
    const today = dateToString();

    if (!svnUrl) {
        log.warn("SVN_URL non configurato — collector SVN saltato.");
        return [];
    }

    await fs.mkdir(SVN_DIR, { recursive: true });

    const meta = await readMeta(SVN_DIR);
    const outPaths: string[] = [];
    const sources = [svnUrl];

    if (range) {
        // Range-aware mode
        const month = currentMonthString(range.start);
        const outPath = path.join(SVN_DIR, `${month}.json`);
        const startStr = dateToString(range.start);
        const endStr = dateToString(range.end);

        try {
            const args = ["log", "--xml", "--with-all-revprops", "-r", `{${startStr}}:{${endStr}}`];
            if (user && pass) args.push("--username", user, "--password", pass, "--no-auth-cache");
            args.push(svnUrl);

            log.info(`  [SVN] Estrazione range ${startStr} -> ${endStr}...`);
            const xmlOutput = await runSvn(args, svnBin);
            const parsed = (await parseXml(xmlOutput)) as any;
            const entries = parsed?.log?.logentry ?? [];

            const commits: SvnCommitRaw[] = entries
                .flatMap((e: any) => {
                    const rawDate = (e.date ?? [])[0] ?? "";
                    return [
                        {
                            revision: e.$.revision,
                            author: (e.author ?? [""])[0],
                            date: dateToString(rawDate),
                            message: ((e.msg ?? [""])[0] ?? "").trim(),
                            paths: (e.paths?.[0]?.path ?? []).map((p: any) => p._),
                        },
                    ];
                })
                .filter((c: SvnCommitRaw) => !user || c.author === user);

            const merged = await mergeByKey<SvnCommitRaw>(outPath, commits, "revision");
            await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
            await writeMeta(SVN_DIR, month, { lastExtractedDate: today, sources });
            return [outPath];
        } catch (err) {
            log.warn(`  [SVN] Errore nel range: ${(err as Error).message}`);
            return [];
        }
    }

    return outPaths;
}
