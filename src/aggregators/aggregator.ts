/**
 * Aggregator: reads all raw data from data/raw/ and produces per-day bundles
 * in data/aggregated/YYYY-MM-DD.json for every workday found in Zucchetti data.
 *
 * Usage: tsx src/analysis/aggregator.ts
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { CONFIG } from "@shared/env-config";

import {
    hhmmToHours,
    groupTpEntriesByTask,
    parseTpDate,
} from "../targetprocess/format";
import { createLogger } from "../logger";
import { readJson, readJsonArray, writeJson, readMeta, listJsonFiles } from "../json-io";
import {
    ZucchettiDay,
    isWorkday,
    parseZucchettiLocation,
    calculateAbsenceHours,
    WorkLocation,
} from "@shared/zucchetti";
import { dateToString, extractMonthStr, todayMidnight } from "@shared/dates";
import { WORKDAY_HOURS } from "@shared/standards";
import { TpTimeEntry } from "@shared/targetprocess";
import {
    AggregatedDay,
    SvnCommitRaw,
    GitCommitRaw,
    BrowserVisit,
    NibolBooking,
} from "@shared/aggregator";
import { fileURLToPath } from "node:url";
import { isEqual, isPast } from "date-fns";
import { CalendarEventRaw, EmailRaw, TeamsChatDataRaw, TeamsChatMessageRaw } from "@shared/graph";

const isMainModule =
    process.argv[1] &&
    (process.argv[1] === fileURLToPath(import.meta.url) ||
        process.argv[1].includes("aggregator"));

const log = createLogger("aggregator");

const RAW_DIR = path.join(process.cwd(), "data", "raw");
const AGG_DIR = path.join(process.cwd(), "data", "aggregated");

const ZUCC_DIR   = path.join(RAW_DIR, "zucchetti");
const CAL_DIR    = path.join(RAW_DIR, "graph-calendar");
const EMAIL_DIR  = path.join(RAW_DIR, "graph-email");
const TEAMS_DIR  = path.join(RAW_DIR, "graph-teams");
const GIT_DIR    = path.join(RAW_DIR, "git");
const SVN_DIR    = path.join(RAW_DIR, "svn");
const CHROME_DIR = path.join(RAW_DIR, "browser-chrome");
const FIREFOX_DIR = path.join(RAW_DIR, "browser-firefox");
const NIBOL_DIR  = path.join(RAW_DIR, "nibol");

/** Reads all YYYY-MM.json files from a directory and concatenates their arrays. */
async function loadDirMonthly<T>(dir: string): Promise<T[]> {
    const files = await listJsonFiles(dir, { pattern: /^\d{4}-\d{2}\.json$/ });
    const all: T[] = [];

    for (const file of files) {
        const items = await readJsonArray<T>(path.join(dir, file));
        all.push(...items);
    }

    return all;
}

/** Group an array of records by date (YYYY-MM-DD from a given property) for efficient o(1) lookup. */
function groupByDate<T>(
    items: T[],
    getDate: (item: T) => Date | string | undefined | null,
): Map<string, T[]> {
    const map = new Map<string, T[]>();
    for (const item of items) {
        const val = getDate(item);
        if (!val) continue;
        const d = dateToString(val);
        if (!map.has(d)) map.set(d, []);
        map.get(d)!.push(item);
    }
    return map;
}

/**
 * Groups TeamsChatDataRaw[] by date: for each chat, splits messages by day and
 * produces one TeamsChatDataRaw entry per (chat × date) combination.
 */
function groupTeamsByDate(chats: TeamsChatDataRaw[]): Map<string, TeamsChatDataRaw[]> {
    const map = new Map<string, TeamsChatDataRaw[]>();
    for (const chat of chats) {
        // Group messages within this chat by date
        const msgByDate = new Map<string, TeamsChatMessageRaw[]>();
        for (const m of chat.messages) {
            const d = m.createdDateTime?.slice(0, 10);
            if (d) {
                if (!msgByDate.has(d)) msgByDate.set(d, []);
                msgByDate.get(d)!.push(m);
            }
        }
        // Emit a TeamsChatDataRaw slice per date
        for (const [date, msgs] of msgByDate) {
            if (!map.has(date)) map.set(date, []);
            map.get(date)!.push({
                chatId:              chat.chatId,
                chatTopic:           chat.chatTopic,
                chatType:            chat.chatType,
                lastModifiedDateTime: chat.lastModifiedDateTime,
                messages:            msgs,
            });
        }
    }
    return map;
}

/** Unified construction of the AggregatedDay object from various raw signals. */
export function buildAggregatedDay(
    date:      Date,
    zDay:      ZucchettiDay,
    calendar:  CalendarEventRaw[],
    emails:    EmailRaw[],
    teams:     TeamsChatDataRaw[],
    svn:       SvnCommitRaw[],
    git:       GitCommitRaw[],
    browser:   BrowserVisit[],
    nibol:     NibolBooking | null,
    tpEntries: TpTimeEntry[],
): AggregatedDay {
    const workday = isWorkday(zDay);
    const isComplete = isPast(date) && date < todayMidnight();
    const rawOre = zDay.hOrd ? hhmmToHours(zDay.hOrd) : null;
    const assenze = calculateAbsenceHours(zDay);

    // Se Zucchetti ha valorizzato hOrd (es. 3:51), è il target reale di lavoro per quel giorno.
    // Se hOrd è vuoto ma è un giorno lavorativo, fall-back a 7.7 meno eventuali assenze.
    const oreTarget =
        rawOre ?? (workday
              ? Math.max(0, WORKDAY_HOURS - assenze)
              : 0);

    return {
        date,
        isWorkday:  workday,
        isComplete,
        oreTarget,
        location:   workday ? parseZucchettiLocation(zDay) : WorkLocation.unknown,
        nibol,
        zucchetti:  zDay,
        calendar,
        emails,
        teams,
        svnCommits: svn,
        gitCommits: git,
        browserVisits: browser,
        reportedHours: groupTpEntriesByTask(
            tpEntries.filter((e) => {
                const d = parseTpDate(e.Date);
                return d && isEqual(d, date);
            }),
        ),
    };
}

/** Load a single month file from a raw source directory. */
async function loadMonthFile<T>(dir: string, monthStr: string): Promise<T[]> {
    return readJsonArray<T>(path.join(dir, `${monthStr}.json`));
}

/** Load Teams chat files matching a date via .meta.json activeDays, filtering messages to that date. */
async function loadTeamsForDate(
    dir: string,
    date: Date | string,
): Promise<TeamsChatDataRaw[]> {
    const dStr = dateToString(date);
    const meta = await readMeta(dir);
    const matchedFiles: string[] = [];

    for (const [fileName, fileMeta] of Object.entries(meta)) {
        if (fileMeta.activeDays?.includes(dStr)) {
            matchedFiles.push(`${fileName}.json`);
        }
    }

    const result: TeamsChatDataRaw[] = [];
    for (const file of matchedFiles) {
        const data = await readJson<TeamsChatDataRaw>(
            path.join(dir, file),
            // Fallback: empty chat shape
            { chatId: "", chatTopic: "", chatType: "", lastModifiedDateTime: "", messages: [] },
        );
        const msgs = data.messages.filter(
            (m) => m.createdDateTime?.slice(0, 10) === dStr,
        );
        if (msgs.length > 0) {
            result.push({ ...data, messages: msgs });
        }
    }
    return result;
}

/** Load all Teams chat files from a directory. */
async function loadDirTeams(dir: string): Promise<TeamsChatDataRaw[]> {
    const files = await listJsonFiles(dir, {
        pattern: /^(O2O|GRP|MET)__.*__[a-z0-9]{6}\.json$/,
    });
    const all: TeamsChatDataRaw[] = [];

    for (const file of files) {
        const data = await readJson<TeamsChatDataRaw>(
            path.join(dir, file),
            { chatId: "", chatTopic: "", chatType: "", lastModifiedDateTime: "", messages: [] },
        );
        all.push(data);
    }

    return all;
}

/** Load TP time entries from enriched day files. */
async function loadDirTp(dir: string): Promise<TpTimeEntry[]> {
    const files = await listJsonFiles(dir, { pattern: /^enriched-.*\.json$/ });
    const all: TpTimeEntry[] = [];
    for (const file of files) {
        const items = await readJsonArray<TpTimeEntry>(path.join(dir, file));
        all.push(...items);
    }
    return all;
}

/**
 * Aggregate a single day: reads raw source files for the target month,
 * filters by date, builds and writes AggregatedDay, and returns it.
 */
export async function aggregateSingleDay(
    date: Date,
    zDay: ZucchettiDay,
): Promise<AggregatedDay> {
    const monthStr =  extractMonthStr(date);

    const [
        calendar,
        emails,
        teams,
        svn,
        git,
        chrome,
        firefox,
        nibolMonth,
        tpEnriched,
    ] = await Promise.all([
        loadMonthFile<CalendarEventRaw>(CAL_DIR, monthStr),
        loadMonthFile<EmailRaw>(EMAIL_DIR, monthStr),
        loadTeamsForDate(TEAMS_DIR, date),
        loadMonthFile<SvnCommitRaw>(SVN_DIR, monthStr),
        loadMonthFile<GitCommitRaw>(GIT_DIR, monthStr),
        loadMonthFile<BrowserVisit>(CHROME_DIR, monthStr),
        loadMonthFile<BrowserVisit>(FIREFOX_DIR, monthStr),
        loadMonthFile<NibolBooking>(NIBOL_DIR, monthStr),
        loadDirTp(ZUCC_DIR.replace("zucchetti", "targetprocess")),
    ]);

    const nibol = nibolMonth.find((b) => isEqual(b.date, date)) ?? null;
    const bundle = buildAggregatedDay(
        date,
        zDay,
        calendar.filter((e) => e.start?.dateTime && isEqual(new Date(e.start.dateTime.slice(0, 10)), date)),
        emails.filter((e) => {
            const dStr = (e.direction === "sent" ? e.sentDateTime : e.receivedDateTime)?.slice(0, 10);
            return dStr && isEqual(new Date(dStr), date);
        }),
        teams,
        svn.filter((c) => c.date && isEqual(new Date(c.date.slice(0, 10)), date)),
        git.filter((c) => c.date && isEqual(new Date(c.date.slice(0, 10)), date)),
        [...chrome, ...firefox].filter((v) => isEqual(v.date, date)),
        nibol,
        tpEnriched,
    );

    await fs.mkdir(AGG_DIR, { recursive: true });
    await writeJson(path.join(AGG_DIR, `${dateToString(date)}.json`), bundle);

    return bundle;
}

export async function runAggregation(): Promise<void> {
    log.info("Aggregazione dati raw → aggregated...");

    await fs.mkdir(AGG_DIR, { recursive: true });
    const sinceDate = CONFIG.COLLECT_SINCE;

    const zuccDays    = await loadDirMonthly<ZucchettiDay>(ZUCC_DIR);
    const calendar    = await loadDirMonthly<CalendarEventRaw>(CAL_DIR);
    const emails      = await loadDirMonthly<EmailRaw>(EMAIL_DIR);
    const teams       = await loadDirTeams(TEAMS_DIR);
    const svn         = await loadDirMonthly<SvnCommitRaw>(SVN_DIR);
    const git         = await loadDirMonthly<GitCommitRaw>(GIT_DIR);
    const chromeBrows = await loadDirMonthly<BrowserVisit>(CHROME_DIR);
    const firefoxBrows = await loadDirMonthly<BrowserVisit>(FIREFOX_DIR);
    const nibolAll    = await loadDirMonthly<NibolBooking>(NIBOL_DIR);
    const browser     = [...chromeBrows, ...firefoxBrows];
    const tpAll       = await loadDirTp(ZUCC_DIR.replace("zucchetti", "targetprocess"));

    log.info(`Zucchetti: ${zuccDays.length} giorni`);
    log.info(`Calendar: ${calendar.length} eventi`);
    log.info(`Email: ${emails.length}`);
    log.info(`Teams: ${teams.reduce((s, c) => s + c.messages.length, 0)} messaggi`);
    log.info(`SVN: ${svn.length} commit`);
    log.info(`Git: ${git.length} commit`);
    log.info(`Browser: ${browser.length} visite`);
    log.info(`TargetProcess: ${tpAll.length} ore`);
    log.info(`Nibol: ${nibolAll.length} prenotazioni`);

    // Build date-indexed maps for fast lookup
    const calByDate     = groupByDate(calendar, (e) => e.start?.dateTime);
    const emailByDate   = groupByDate(emails, (e) =>
        e.direction === "sent" ? e.sentDateTime : e.receivedDateTime,
    );
    const teamsByDate   = groupTeamsByDate(teams);
    const svnByDate     = groupByDate(svn, (e) => e.date);
    const gitByDate     = groupByDate(git, (e) => e.date);
    const browserByDate = groupByDate(browser, (v) => v.date);
    const nibolByDate   = new Map(nibolAll.map((b) => [dateToString(b.date), b]));

    let written = 0;

    const since = new Date(sinceDate);
    for (const zDay of zuccDays) {
        const dateObj = new Date(zDay.date);
        if (dateObj < since) continue;

        const dStr = zDay.date;
        const bundle = buildAggregatedDay(
            dateObj,
            zDay,
            calByDate.get(dStr)     ?? [],
            emailByDate.get(dStr)   ?? [],
            teamsByDate.get(dStr)   ?? [],
            svnByDate.get(dStr)     ?? [],
            gitByDate.get(dStr)     ?? [],
            browserByDate.get(dStr) ?? [],
            nibolByDate.get(dStr)   ?? null,
            tpAll,
        );

        await writeJson(path.join(AGG_DIR, `${dStr}.json`), bundle);
        written++;
    }

    log.info(`Aggregazione completata: ${written} giorni scritti in ${AGG_DIR}`);
}

if (isMainModule) {
    runAggregation().catch((err: Error) => {
        log.error(`Errore aggregazione: ${err.message}`);
        process.exit(1);
    });
}
