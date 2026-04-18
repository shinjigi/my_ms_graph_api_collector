import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { parseString } from "xml2js";
import { createLogger } from "../../logger";

import { mergeByKey, writeMeta, writeJson } from "../../utils";
import { SvnCommitRaw } from "@shared/aggregator";
import {
    dateToString,
    currentMonthString,
    startOfMonth,
    addMonths,
    lastDayOfMonthString,
    DateRange,
} from "@shared/dates";
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

function parseCommits(entries: SvnLogEntry[], authorFilter?: string): SvnCommitRaw[] {
    const commits = entries.flatMap((e) => {
        const rawDate = (e.date ?? [])[0] ?? "";
        if (Number.isNaN(new Date(rawDate).getTime())) return [];
        return [{
            revision: e.$.revision,
            author:   (e.author ?? [""])[0],
            date:     dateToString(rawDate),
            message:  ((e.msg ?? [""])[0] ?? "").trim(),
            paths:    (e.paths?.[0]?.path ?? []).map((p) => p._),
        }];
    });
    return authorFilter ? commits.filter((c) => c.author === authorFilter) : commits;
}

async function fetchAndWrite(
    svnUrl: string,
    svnBin: string,
    user: string,
    pass: string,
    startStr: string,
    endStr: string,
    outPath: string,
    month: string,
): Promise<string> {
    const args = ["log", "--xml", "--with-all-revprops", "-r", `{${startStr}}:{${endStr}}`];
    if (user && pass) args.push("--username", user, "--password", pass, "--no-auth-cache");
    args.push(svnUrl);

    const xmlOutput = await runSvn(args, svnBin);
    const parsed    = (await parseXml(xmlOutput)) as SvnXmlParsed;
    const commits   = parseCommits(parsed?.log?.logentry ?? [], user);

    const merged = await mergeByKey<SvnCommitRaw>(outPath, commits, "revision");
    await writeJson(outPath, merged);
    await writeMeta(SVN_DIR, month, { lastExtractedDate: dateToString(), sources: [svnUrl] });
    return outPath;
}

export async function collectSvnCommits(range: DateRange | undefined, _force = false): Promise<string[]> {
    const svnUrl = CONFIG.SVN_URL;
    const svnBin = CONFIG.SVN_BIN;
    const user   = CONFIG.SVN_USERNAME;
    const pass   = CONFIG.SVN_PASSWORD;

    if (!svnUrl) {
        log.warn("SVN_URL non configurato — collector SVN saltato.");
        return [];
    }

    await fs.mkdir(SVN_DIR, { recursive: true });

    if (range) {
        const month   = currentMonthString(range.start);
        const outPath = path.join(SVN_DIR, `${month}.json`);
        const startStr = dateToString(range.start);
        const endStr   = dateToString(range.end);
        log.info(`  [SVN] Range ${startStr} → ${endStr}...`);
        try {
            return [await fetchAndWrite(svnUrl, svnBin, user, pass, startStr, endStr, outPath, month)];
        } catch (err) {
            log.warn(`  [SVN] Errore nel range: ${(err as Error).message}`);
            return [];
        }
    }

    // Full-range mode: iterate months from COLLECT_SINCE to today
    const outPaths: string[] = [];
    let current = startOfMonth(CONFIG.COLLECT_SINCE);
    const now = new Date();

    while (current <= now) {
        const month    = currentMonthString(current);
        const outPath  = path.join(SVN_DIR, `${month}.json`);
        const startStr = dateToString(current);
        const endStr   = lastDayOfMonthString(current);

        log.info(`  [SVN] ${month}...`);
        try {
            outPaths.push(await fetchAndWrite(svnUrl, svnBin, user, pass, startStr, endStr, outPath, month));
        } catch (err) {
            log.warn(`  [SVN] ${month}: ${(err as Error).message}`);
        }

        current = addMonths(current, 1);
    }

    return outPaths;
}
