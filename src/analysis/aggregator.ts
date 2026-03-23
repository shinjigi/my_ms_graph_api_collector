/**
 * Aggregator: reads all raw data from data/raw/ and produces per-day bundles
 * in data/aggregated/YYYY-MM-DD.json for every workday found in Zucchetti data.
 *
 * Usage: tsx src/analysis/aggregator.ts
 */
import * as fs    from 'fs/promises';
import * as path  from 'path';
import * as dotenv from 'dotenv';
dotenv.config();

import type { ZucchettiDay }      from '../collectors/zucchetti/index';
import type { CalendarEventRaw }  from '../collectors/graph/calendar';
import type { EmailRaw }          from '../collectors/graph/email';
import type { TeamsMessageRaw }   from '../collectors/graph/teams';
import type { SvnCommit }         from '../collectors/vcs/svn';
import type { GitCommit }         from '../collectors/vcs/git';
import type { BrowserVisit }      from '../collectors/browser/history';
import { hhmmToHours }            from '../targetprocess/format';
import { createLogger }           from '../logger';

const log = createLogger('aggregator');

const RAW_DIR      = path.join(process.cwd(), 'data', 'raw');
const AGG_DIR      = path.join(process.cwd(), 'data', 'aggregated');

const ZUCC_DIR     = path.join(RAW_DIR, 'zucchetti');
const CAL_DIR      = path.join(RAW_DIR, 'graph-calendar');
const EMAIL_DIR    = path.join(RAW_DIR, 'graph-email');
const TEAMS_DIR    = path.join(RAW_DIR, 'graph-teams');
const GIT_DIR      = path.join(RAW_DIR, 'git');
const SVN_DIR      = path.join(RAW_DIR, 'svn');
const CHROME_DIR   = path.join(RAW_DIR, 'browser-chrome');
const FIREFOX_DIR  = path.join(RAW_DIR, 'browser-firefox');

export interface AggregatedDay {
    date:          string;           // YYYY-MM-DD
    isWorkday:     boolean;
    oreTarget:     number;           // decimal hours from Zucchetti hOrd
    location:      'office' | 'smart' | 'mixed' | 'unknown';
    zucchetti:     ZucchettiDay | null;
    calendar:      CalendarEventRaw[];
    emails:        EmailRaw[];
    teams:         TeamsMessageRaw[];
    svnCommits:    SvnCommit[];
    gitCommits:    GitCommit[];
    browserVisits: BrowserVisit[];
}

export function parseZucchettiLocation(day: ZucchettiDay): 'office' | 'smart' | 'mixed' | 'unknown' {
    const hasSmartWorking = day.giustificativi.some(g =>
        g.text.toUpperCase().includes('SMART')
    );
    const hasLeave = day.giustificativi.some(g =>
        g.text.toUpperCase().includes('FERIE') ||
        g.text.toUpperCase().includes('PERM')
    );

    if (hasSmartWorking && hasLeave) return 'mixed';
    if (hasSmartWorking) return 'smart';
    if (day.giustificativi.length === 0) return 'office';
    return 'unknown';
}

export function isWorkday(day: ZucchettiDay): boolean {
    const orario = (day.orario ?? '').toUpperCase();
    // DOM/SAB = weekend, FES = public holiday — future days have empty hOrd but are valid workdays
    return orario !== 'DOM' && orario !== 'SAB' && orario !== 'FES';
}

/** Reads all *.json files from a directory (excluding .meta.json) and concatenates their arrays. */
async function loadDirMonthly<T>(dir: string): Promise<T[]> {
    let entries: string[];
    try {
        entries = await fs.readdir(dir);
    } catch {
        return [];
    }

    const files = entries.filter(f => /^\d{4}-\d{2}\.json$/.test(f));
    const all: T[] = [];

    for (const file of files) {
        try {
            const raw  = await fs.readFile(path.join(dir, file), 'utf-8');
            const data = JSON.parse(raw) as T[];
            if (Array.isArray(data)) all.push(...data);
        } catch {
            // Skip unreadable files
        }
    }

    return all;
}

/** Load a single month file from a raw source directory. */
async function loadMonthFile<T>(dir: string, monthStr: string): Promise<T[]> {
    const filePath = path.join(dir, `${monthStr}.json`);
    try {
        const raw  = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(raw) as T[];
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
}

/**
 * Aggregate a single day: reads raw source files for the target month,
 * filters by date, builds and writes AggregatedDay, and returns it.
 */
export async function aggregateSingleDay(date: string, zDay: ZucchettiDay): Promise<AggregatedDay> {
    const monthStr = date.slice(0, 7);

    const [calendar, emails, teams, svn, git, chrome, firefox] = await Promise.all([
        loadMonthFile<CalendarEventRaw>(CAL_DIR, monthStr),
        loadMonthFile<EmailRaw>(EMAIL_DIR, monthStr),
        loadMonthFile<TeamsMessageRaw>(TEAMS_DIR, monthStr),
        loadMonthFile<SvnCommit>(SVN_DIR, monthStr),
        loadMonthFile<GitCommit>(GIT_DIR, monthStr),
        loadMonthFile<BrowserVisit>(CHROME_DIR, monthStr),
        loadMonthFile<BrowserVisit>(FIREFOX_DIR, monthStr),
    ]);

    const workday   = isWorkday(zDay);
    const rawOre    = zDay.hOrd ? hhmmToHours(zDay.hOrd) : null;
    const oreTarget = workday ? (rawOre ?? 8) : 0;

    const bundle: AggregatedDay = {
        date,
        isWorkday:     workday,
        oreTarget,
        location:      workday ? parseZucchettiLocation(zDay) : 'unknown',
        zucchetti:     zDay,
        calendar:      calendar.filter(e => e.start?.dateTime?.slice(0, 10) === date),
        emails:        emails.filter(e => e.receivedDateTime?.slice(0, 10) === date),
        teams:         teams.filter(m => m.createdDateTime?.slice(0, 10) === date),
        svnCommits:    svn.filter(c => c.date?.slice(0, 10) === date),
        gitCommits:    git.filter(c => c.date?.slice(0, 10) === date),
        browserVisits: [...chrome, ...firefox].filter(v => v.date?.slice(0, 10) === date),
    };

    await fs.mkdir(AGG_DIR, { recursive: true });
    await fs.writeFile(path.join(AGG_DIR, `${date}.json`), JSON.stringify(bundle, null, 2), 'utf-8');

    return bundle;
}

async function run(): Promise<void> {
    log.info('Aggregazione dati raw → aggregated...');

    await fs.mkdir(AGG_DIR, { recursive: true });
    const sinceDate = process.env['COLLECT_SINCE'] ?? '2025-01-01';

    const zuccDays     = await loadDirMonthly<ZucchettiDay>(ZUCC_DIR);
    const calendar     = await loadDirMonthly<CalendarEventRaw>(CAL_DIR);
    const emails       = await loadDirMonthly<EmailRaw>(EMAIL_DIR);
    const teams        = await loadDirMonthly<TeamsMessageRaw>(TEAMS_DIR);
    const svn          = await loadDirMonthly<SvnCommit>(SVN_DIR);
    const git          = await loadDirMonthly<GitCommit>(GIT_DIR);
    const chromeBrows  = await loadDirMonthly<BrowserVisit>(CHROME_DIR);
    const firefoxBrows = await loadDirMonthly<BrowserVisit>(FIREFOX_DIR);
    const browser      = [...chromeBrows, ...firefoxBrows];

    log.debug(`Zucchetti: ${zuccDays.length} giorni`);
    log.debug(`Calendar: ${calendar.length} eventi`);
    log.debug(`Email: ${emails.length}`);
    log.debug(`Teams: ${teams.length} messaggi`);
    log.debug(`SVN: ${svn.length} commit`);
    log.debug(`Git: ${git.length} commit`);
    log.debug(`Browser: ${browser.length} visite`);

    // Build date-indexed maps for fast lookup
    const calByDate     = new Map<string, CalendarEventRaw[]>();
    const emailByDate   = new Map<string, EmailRaw[]>();
    const teamsByDate   = new Map<string, TeamsMessageRaw[]>();
    const svnByDate     = new Map<string, SvnCommit[]>();
    const gitByDate     = new Map<string, GitCommit[]>();
    const browserByDate = new Map<string, BrowserVisit[]>();

    for (const ev of calendar) {
        const d = ev.start?.dateTime?.slice(0, 10);
        if (d) {
            if (!calByDate.has(d)) calByDate.set(d, []);
            calByDate.get(d)!.push(ev);
        }
    }

    for (const em of emails) {
        const d = em.receivedDateTime?.slice(0, 10);
        if (d) {
            if (!emailByDate.has(d)) emailByDate.set(d, []);
            emailByDate.get(d)!.push(em);
        }
    }

    for (const msg of teams) {
        const d = msg.createdDateTime?.slice(0, 10);
        if (d) {
            if (!teamsByDate.has(d)) teamsByDate.set(d, []);
            teamsByDate.get(d)!.push(msg);
        }
    }

    for (const c of svn) {
        const d = c.date?.slice(0, 10);
        if (d) {
            if (!svnByDate.has(d)) svnByDate.set(d, []);
            svnByDate.get(d)!.push(c);
        }
    }

    for (const c of git) {
        const d = c.date?.slice(0, 10);
        if (d) {
            if (!gitByDate.has(d)) gitByDate.set(d, []);
            gitByDate.get(d)!.push(c);
        }
    }

    for (const v of browser) {
        const d = v.date?.slice(0, 10);
        if (d) {
            if (!browserByDate.has(d)) browserByDate.set(d, []);
            browserByDate.get(d)!.push(v);
        }
    }

    let written = 0;

    for (const zDay of zuccDays) {
        const date      = zDay.date;
        if (date < sinceDate) continue;
        const workday   = isWorkday(zDay);
        const rawOre    = zDay.hOrd ? hhmmToHours(zDay.hOrd) : null;
        const oreTarget = workday ? (rawOre ?? 8) : 0;

        const bundle: AggregatedDay = {
            date,
            isWorkday:     workday,
            oreTarget,
            location:      workday ? parseZucchettiLocation(zDay) : 'unknown',
            zucchetti:     zDay,
            calendar:      calByDate.get(date)     ?? [],
            emails:        emailByDate.get(date)   ?? [],
            teams:         teamsByDate.get(date)   ?? [],
            svnCommits:    svnByDate.get(date)     ?? [],
            gitCommits:    gitByDate.get(date)     ?? [],
            browserVisits: browserByDate.get(date) ?? [],
        };

        const outPath = path.join(AGG_DIR, `${date}.json`);
        await fs.writeFile(outPath, JSON.stringify(bundle, null, 2), 'utf-8');
        written++;
    }

    log.info(`Aggregazione completata: ${written} giorni scritti in ${AGG_DIR}`);
}

run().catch((err: Error) => {
    log.error(`Errore aggregazione: ${err.message}`);
    process.exit(1);
});
