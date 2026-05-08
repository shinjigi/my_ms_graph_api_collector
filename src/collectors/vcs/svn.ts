import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { parseString } from "xml2js";
import { createLogger } from "../../logger";

import { mergeByKey, readMeta, writeMeta, writeJson, shouldSkipMonth } from "../../utils";
import { SvnCommitRaw } from "@shared/aggregator";
import {
    dateToString,
    currentMonthString,
    startOfMonth,
    addMonths,
    lastDayOfMonthString,
    DateRange,
    parseDateString,
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

interface SvnInfoXml {
    info?: {
        entry?: Array<{
            url?: string[];
            "relative-url"?: string[];
            "wc-info"?: Array<{ "wcroot-abspath"?: string[] }>;
        }>;
    };
}

interface WcMapping {
    localRoot: string; // e.g. C:\Projects\WCFItaly
    repoPathPrefix: string; // e.g. /projects/WCFItaly/trunk
}

async function getSvnInfo(localPath: string, svnBin: string): Promise<WcMapping | null> {
    try {
        const xml = await runSvn(["info", "--xml", localPath], svnBin);
        const parsed = (await parseXml(xml)) as SvnInfoXml;
        const entry = parsed?.info?.entry?.[0];
        if (!entry) return null;
        const relUrl = (entry["relative-url"]?.[0] ?? "").replace(/^\^/, "");
        const wcRoot = entry["wc-info"]?.[0]?.["wcroot-abspath"]?.[0] ?? localPath;
        if (!relUrl) return null;
        return { localRoot: wcRoot, repoPathPrefix: relUrl };
    } catch {
        return null;
    }
}

async function findWcRoots(dir: string, maxDepth: number): Promise<string[]> {
    if (maxDepth <= 0) return [];
    try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        if (entries.some((e) => e.isDirectory() && e.name === ".svn")) return [dir];
        const results: string[] = [];
        for (const entry of entries) {
            if (!entry.isDirectory() || entry.name.startsWith(".")) continue;
            results.push(...(await findWcRoots(path.join(dir, entry.name), maxDepth - 1)));
        }
        return results;
    } catch {
        return [];
    }
}

async function buildWcMap(roots: string[], svnBin: string): Promise<WcMapping[]> {
    const mappings: WcMapping[] = [];
    const seen = new Set<string>();
    for (const root of roots) {
        for (const wcRoot of await findWcRoots(root, 5)) {
            if (seen.has(wcRoot)) continue;
            seen.add(wcRoot);
            const m = await getSvnInfo(wcRoot, svnBin);
            if (m) mappings.push(m);
        }
    }
    return mappings;
}

function resolveWcPath(svnPath: string, mappings: WcMapping[]): string {
    for (const m of mappings) {
        const prefix = m.repoPathPrefix.endsWith("/") ? m.repoPathPrefix : m.repoPathPrefix + "/";
        if (svnPath.startsWith(prefix) || svnPath === m.repoPathPrefix) {
            const relative = svnPath.slice(m.repoPathPrefix.length).replace(/^\//, "");
            return path.join(m.localRoot, relative);
        }
    }
    return svnPath;
}

function parseCommits(
    entries: SvnLogEntry[],
    wcMappings: WcMapping[],
    authorFilter?: string,
): SvnCommitRaw[] {
    const commits = entries.flatMap((e) => {
        const dateStr = (e.date ?? [])[0];
        if (!dateStr) return [];
        const rawDate = parseDateString(dateStr);
        if (Number.isNaN(rawDate.getTime())) return [];
        const svnPaths = (e.paths?.[0]?.path ?? []).map((p) => p._);
        return [
            {
                revision: e.$.revision,
                author: (e.author ?? [""])[0],
                date: rawDate,
                message: ((e.msg ?? [""])[0] ?? "").trim(),
                paths: svnPaths.map((p) => resolveWcPath(p, wcMappings)),
            },
        ];
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
    wcMappings: WcMapping[],
): Promise<string> {
    const args = ["log", "--xml", "-v", "--with-all-revprops", "-r", `{${startStr}}:{${endStr}}`];
    if (user && pass) args.push("--username", user, "--password", pass, "--no-auth-cache");
    args.push(svnUrl);

    const xmlOutput = await runSvn(args, svnBin);
    const parsed = (await parseXml(xmlOutput)) as SvnXmlParsed;
    const commits = parseCommits(parsed?.log?.logentry ?? [], wcMappings, user);

    const merged = await mergeByKey<SvnCommitRaw>(outPath, commits, "revision");
    await writeJson(outPath, merged);
    await writeMeta(SVN_DIR, month, { lastExtractedDate: dateToString(), sources: [svnUrl] });
    return outPath;
}

export async function collectSvnCommits(
    range: DateRange | undefined,
    _force = false,
): Promise<string[]> {
    const svnUrl = CONFIG.SVN_URL;
    const svnBin = CONFIG.SVN_BIN;
    const user = CONFIG.SVN_USERNAME;
    const pass = CONFIG.SVN_PASSWORD;

    if (!svnUrl) {
        log.warn("SVN_URL non configurato — collector SVN saltato.");
        return [];
    }

    await fs.mkdir(SVN_DIR, { recursive: true });

    const svnRoots = CONFIG.SVN_ROOTS ?? [];
    const wcMappings = svnRoots.length > 0 ? await buildWcMap(svnRoots, svnBin) : [];
    if (wcMappings.length > 0) {
        const fnct = (m: WcMapping) =>
            `${m.repoPathPrefix.padEnd(65, " ").substring(0, 65)}${m.repoPathPrefix.length>65 ? "..." : ""}\t→\t${m.localRoot}`;

        log.info(
            `  [SVN] WC mappings trovati:\n\t\t\t${wcMappings.map((m) => fnct(m)).join(",\n\t\t\t")}`,
        );
    }

    if (range) {
        const month = currentMonthString(range.start);
        const outPath = path.join(SVN_DIR, `${month}.json`);
        const startStr = dateToString(range.start);
        const endStr = dateToString(range.end);
        const meta = await readMeta(SVN_DIR);
        const isCurrentMonth = month === currentMonthString();
        if (!_force && !isCurrentMonth && shouldSkipMonth(meta[month], month, [svnUrl])) {
            log.info(`  [SVN] ${month}: skip`);
            return [outPath];
        }

        log.info(`  [SVN] Range ${startStr} → ${endStr}...`);
        try {
            return [
                await fetchAndWrite(
                    svnUrl,
                    svnBin,
                    user,
                    pass,
                    startStr,
                    endStr,
                    outPath,
                    month,
                    wcMappings,
                ),
            ];
        } catch (err) {
            log.warn(`  [SVN] Errore nel range: ${(err as Error).message}`);
            return [];
        }
    }

    // Full-range mode: iterate months from COLLECT_SINCE to today
    const outPaths: string[] = [];
    let current = startOfMonth(CONFIG.COLLECT_SINCE);
    const now = new Date();

    const meta = await readMeta(SVN_DIR);
    while (current <= now) {
        const month = currentMonthString(current);
        const isCurrentMonth = month === currentMonthString();
        const outPath = path.join(SVN_DIR, `${month}.json`);
        const startStr = dateToString(current);
        const endStr = lastDayOfMonthString(current);

        if (!_force && !isCurrentMonth && shouldSkipMonth(meta[month], month, [svnUrl])) {
            log.info(`  [SVN] ${month}: skip`);
            outPaths.push(outPath);
        } else {
            log.info(`  [SVN] ${month}...`);
            try {
                outPaths.push(
                    await fetchAndWrite(
                        svnUrl,
                        svnBin,
                        user,
                        pass,
                        startStr,
                        endStr,
                        outPath,
                        month,
                        wcMappings,
                    ),
                );
            } catch (err) {
                log.warn(`  [SVN] ${month}: ${(err as Error).message}`);
            }
        }

        current = addMonths(current, 1);
    }

    return outPaths;
}
