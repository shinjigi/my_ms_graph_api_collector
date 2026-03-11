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

import type { ZucchettiDay }      from '../collectors/zucchetti';
import type { CalendarEventRaw }  from '../collectors/graph-calendar';
import type { EmailRaw }          from '../collectors/graph-email';
import type { TeamsMessageRaw }   from '../collectors/graph-teams';
import type { SvnCommit }         from '../collectors/svn-commits';
import type { GitCommit }         from '../collectors/git-commits';
import { hhmmToHours }            from '../targetprocess/format';

const RAW_DIR  = path.join(process.cwd(), 'data', 'raw');
const AGG_DIR  = path.join(process.cwd(), 'data', 'aggregated');

export interface AggregatedDay {
    date:         string;           // YYYY-MM-DD
    isWorkday:    boolean;
    oreTarget:    number;           // decimal hours from Zucchetti hOrd
    location:     'office' | 'smart' | 'mixed' | 'unknown';
    zucchetti:    ZucchettiDay | null;
    calendar:     CalendarEventRaw[];
    emails:       EmailRaw[];
    teams:        TeamsMessageRaw[];
    svnCommits:   SvnCommit[];
    gitCommits:   GitCommit[];
}

function parseZucchettiLocation(day: ZucchettiDay): 'office' | 'smart' | 'mixed' | 'unknown' {
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

function isWorkday(day: ZucchettiDay): boolean {
    const orario = (day.orario ?? '').toUpperCase();

    // Weekend markers
    if (orario === 'DOM' || orario === 'SAB') return false;

    // Empty hOrd means holiday or full-day leave
    if (!day.hOrd || day.hOrd.trim() === '') return false;

    return true;
}

async function loadJsonFile<T>(filePath: string): Promise<T[]> {
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(raw) as T[];
    } catch {
        return [];
    }
}

async function loadZucchettiAll(): Promise<ZucchettiDay[]> {
    const entries = await fs.readdir(RAW_DIR).catch(() => [] as string[]);
    const files   = entries.filter(f => /^zucchetti-\d{4}-\d{2}\.json$/.test(f));
    const all: ZucchettiDay[] = [];

    for (const file of files) {
        const days = await loadJsonFile<ZucchettiDay>(path.join(RAW_DIR, file));
        all.push(...days);
    }

    return all;
}

async function run(): Promise<void> {
    console.log('Aggregazione dati raw → aggregated...');

    await fs.mkdir(AGG_DIR, { recursive: true });

    const zuccDays  = await loadZucchettiAll();
    const calendar  = await loadJsonFile<CalendarEventRaw>(path.join(RAW_DIR, 'graph-calendar-events.json'));
    const emails    = await loadJsonFile<EmailRaw>(path.join(RAW_DIR, 'graph-emails.json'));
    const teams     = await loadJsonFile<TeamsMessageRaw>(path.join(RAW_DIR, 'graph-teams-messages.json'));
    const svn       = await loadJsonFile<SvnCommit>(path.join(RAW_DIR, 'svn-commits.json'));
    const git       = await loadJsonFile<GitCommit>(path.join(RAW_DIR, 'git-commits.json'));

    console.log(`  Zucchetti: ${zuccDays.length} giorni`);
    console.log(`  Calendar: ${calendar.length} eventi`);
    console.log(`  Email: ${emails.length}`);
    console.log(`  Teams: ${teams.length} messaggi`);
    console.log(`  SVN: ${svn.length} commit`);
    console.log(`  Git: ${git.length} commit`);

    // Build date-indexed maps for fast lookup
    const calByDate   = new Map<string, CalendarEventRaw[]>();
    const emailByDate = new Map<string, EmailRaw[]>();
    const teamsByDate = new Map<string, TeamsMessageRaw[]>();
    const svnByDate   = new Map<string, SvnCommit[]>();
    const gitByDate   = new Map<string, GitCommit[]>();

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

    let written = 0;

    for (const zDay of zuccDays) {
        const date     = zDay.date;
        const workday  = isWorkday(zDay);
        const oreTarget = workday ? hhmmToHours(zDay.hOrd) : 0;

        const bundle: AggregatedDay = {
            date,
            isWorkday:  workday,
            oreTarget,
            location:   workday ? parseZucchettiLocation(zDay) : 'unknown',
            zucchetti:  zDay,
            calendar:   calByDate.get(date)   ?? [],
            emails:     emailByDate.get(date)  ?? [],
            teams:      teamsByDate.get(date)  ?? [],
            svnCommits: svnByDate.get(date)    ?? [],
            gitCommits: gitByDate.get(date)    ?? [],
        };

        const outPath = path.join(AGG_DIR, `${date}.json`);
        await fs.writeFile(outPath, JSON.stringify(bundle, null, 2), 'utf-8');
        written++;
    }

    console.log(`\nAggregazione completata: ${written} giorni scritti in ${AGG_DIR}`);
}

run().catch((err: Error) => {
    console.error('Errore aggregazione:', err.message);
    process.exit(1);
});
