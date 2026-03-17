/**
 * Week data route: serves aggregated Zucchetti and TP hours for a given week.
 * GET /api/week/:date           → full week context (Mon-Sun)
 * GET /api/week/:date/tp-hours  → TP time entries for the week
 */
import { Router, Request, Response } from 'express';
import * as fs                from 'fs/promises';
import * as path              from 'path';
import { TargetprocessClient } from '../../targetprocess/client';
import { parseTpDate, hhmmToHours } from '../../targetprocess/format';
import type { AggregatedDay } from '../../analysis/aggregator';
import type { ZucchettiDay } from '../../collectors/zucchetti';

export const weekRouter = Router();

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');
const AGG_DIR = path.join(process.cwd(), 'data', 'aggregated');

interface WeekDayData {
    date:        string;
    isWorkday:   boolean;
    oreTarget:   number;
    location:    string;
    nibol:       string | null;
    holiday:     boolean;
    holidayName?: string;
    zucchetti:   ZucchettiDay | null;
    calendar:    unknown[];
    emails:      unknown[];
    teams:       unknown[];
    svnCommits:  unknown[];
    gitCommits:  unknown[];
    browserVisits: unknown[];
}

interface WeekResponse {
    monday: string;
    days:   WeekDayData[];
}

interface TpWeekEntry {
    tpId:        number;
    usName:      string;
    stateName:   string;
    timeSpent:   number;
    projectName: string;
    hours:       number[];
}

interface TpWeekResponse {
    userId:   number;
    userName: string;
    entries:  TpWeekEntry[];
    openItems: unknown[];
}

function getMonday(dateStr: string): Date {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    return d;
}

function dateToString(d: Date): string {
    // Use local date components — toISOString() uses UTC and shifts in CET/CEST
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
}

async function readAggregatedDay(date: string): Promise<AggregatedDay | null> {
    const filePath = path.join(AGG_DIR, `${date}.json`);
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(raw) as AggregatedDay;
    } catch {
        return null;
    }
}

async function loadZucchettiMonth(month: string): Promise<ZucchettiDay[]> {
    const filePath = path.join(RAW_DIR, 'zucchetti', `${month}.json`);
    try {
        const raw = await fs.readFile(filePath, 'utf-8');
        const data = JSON.parse(raw) as { days?: ZucchettiDay[] };
        return data.days ?? [];
    } catch {
        return [];
    }
}

function parseZucchettiLocation(day: ZucchettiDay): string {
    if (!day.giustificativi || day.giustificativi.length === 0) return 'office';
    const hasSmartWorking = day.giustificativi.some(g =>
        (g.text ?? '').toUpperCase().includes('SMART')
    );
    const hasLeave = day.giustificativi.some(g => {
        const text = (g.text ?? '').toUpperCase();
        return text.includes('FERIE') || text.includes('PERM');
    });
    if (hasSmartWorking && hasLeave) return 'mixed';
    if (hasSmartWorking) return 'smart';
    return 'office';
}

function isWorkday(day: ZucchettiDay): boolean {
    const orario = (day.orario ?? '').toUpperCase();
    if (orario === 'DOM' || orario === 'SAB') return false;
    if (!day.hOrd || day.hOrd.trim() === '') return false;
    return true;
}

// GET /api/week/:date
weekRouter.get('/:date', async (req: Request, res: Response) => {
    const dateStr = req.params.date as string;
    const monday = getMonday(dateStr);

    const weekDays: WeekDayData[] = [];
    const monthsToLoad = new Set<string>();

    // Plan which Zucchetti months to load (use local date string to avoid UTC shift)
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        monthsToLoad.add(dateToString(d).slice(0, 7));
    }

    // Load raw Zucchetti data as fallback for days without aggregated files
    const zuccAll: ZucchettiDay[] = [];
    for (const month of monthsToLoad) {
        const days = await loadZucchettiMonth(month);
        zuccAll.push(...days);
    }

    // Build 7-day week response
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dateStr = dateToString(d);

        // Aggregated file is the primary source — already contains isWorkday, oreTarget, location
        const agg = await readAggregatedDay(dateStr);

        // Fall back to raw Zucchetti for days without an aggregated file
        const zuccDay: ZucchettiDay | null = agg?.zucchetti ?? zuccAll.find(z => z.date === dateStr) ?? null;

        const isWd      = agg?.isWorkday   ?? (zuccDay ? isWorkday(zuccDay) : false);
        const oreTarget = agg?.oreTarget   ?? (zuccDay && isWd ? hhmmToHours(zuccDay.hOrd) : 0);
        const location  = agg?.location    ?? (zuccDay && isWd ? parseZucchettiLocation(zuccDay) : 'unknown');

        const dayData: WeekDayData = {
            date:         dateStr,
            isWorkday:    isWd,
            oreTarget,
            location,
            nibol:        null, // not yet in aggregated data
            holiday:      !isWd,
            holidayName:  undefined,
            zucchetti:    zuccDay,
            calendar:     agg?.calendar      ?? [],
            emails:       agg?.emails        ?? [],
            teams:        agg?.teams         ?? [],
            svnCommits:   agg?.svnCommits    ?? [],
            gitCommits:   agg?.gitCommits    ?? [],
            browserVisits: agg?.browserVisits ?? [],
        };

        weekDays.push(dayData);
    }

    const response: WeekResponse = {
        monday: dateToString(monday),
        days:   weekDays,
    };

    res.json(response);
});

// GET /api/week/:date/tp-hours
weekRouter.get('/:date/tp-hours', async (req: Request, res: Response) => {
    try {
        const dateStr = req.params.date as string;
        const monday = getMonday(dateStr);
        const friday = new Date(monday);
        friday.setDate(monday.getDate() + 4);

        const fridayStr = dateToString(friday);

        const tpClient = new TargetprocessClient();
        const me = await tpClient.getMe();
        const timeEntries = await tpClient.getTimesByUserAndDateRange(
            me.Id,
            dateToString(monday),
            fridayStr
        );
        const openItems = await tpClient.getMyAssignedOpenItems();

        // Parse time entries and group by assignable + date
        const entriesByAssignable = new Map<number, Map<number, number>>();

        for (const entry of timeEntries) {
            const dateStr = parseTpDate(entry.Date);
            if (dateStr === '-') continue;

            const dayIndex = (() => {
                const d = new Date(dateStr);
                const dow = d.getDay();
                const daysFromMonday = (dow === 0 ? 6 : dow - 1);
                return daysFromMonday;
            })();

            if (dayIndex < 0 || dayIndex > 4) continue;

            const tpId = (entry as unknown as { Assignable?: { Id: number } }).Assignable?.Id;
            if (!tpId) continue;

            if (!entriesByAssignable.has(tpId)) {
                entriesByAssignable.set(tpId, new Map());
            }
            const dayMap = entriesByAssignable.get(tpId)!;
            dayMap.set(dayIndex, (dayMap.get(dayIndex) ?? 0) + entry.Spent);
        }

        // Build response entries from openItems, crossing with time data
        const entries: TpWeekEntry[] = [];
        for (const item of openItems) {
            const tpId = item.id;
            const dayHours = entriesByAssignable.get(tpId);
            const hours: number[] = [0, 1, 2, 3, 4].map(i => dayHours?.get(i) ?? 0);

            entries.push({
                tpId,
                usName:      item.name,
                stateName:   item.stateName,
                timeSpent:   item.timeSpent,
                projectName: item.projectName,
                hours,
            });
        }

        const response: TpWeekResponse = {
            userId:    me.Id,
            userName:  me.FullName,
            entries,
            openItems,
        };

        res.json(response);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});
