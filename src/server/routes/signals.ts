/**
 * Signals routes: serve per-day git/SVN commits, Teams messages, and browser visits
 * from the pre-built aggregated day files.
 *
 * GET /api/day/:date/commits  → { gitCommits, svnCommits }
 * GET /api/day/:date/teams    → { messages, date }
 * GET /api/day/:date/browser  → { visits, byDomain, totalVisits, totalDomains, date }
 */
import { Router }    from 'express';
import * as fs       from 'fs/promises';
import * as path     from 'path';
import type { AggregatedDay } from '../../analysis/aggregator';

export const signalsRouter = Router();

const AGG_DIR = path.join(process.cwd(), 'data', 'aggregated');

async function loadDay(date: string): Promise<AggregatedDay | null> {
    const file = path.join(AGG_DIR, `${date}.json`);
    try {
        const raw = await fs.readFile(file, 'utf-8');
        return JSON.parse(raw) as AggregatedDay;
    } catch {
        return null;
    }
}

signalsRouter.get('/:date/commits', async (req, res) => {
    const { date } = req.params;
    const day = await loadDay(date);
    if (!day) {
        res.status(404).json({ error: `Nessun dato aggregato per ${date}` });
        return;
    }
    res.json({
        date,
        gitCommits: day.gitCommits,
        svnCommits: day.svnCommits,
    });
});

signalsRouter.get('/:date/teams', async (req, res) => {
    const { date } = req.params;
    const day = await loadDay(date);
    if (!day) {
        res.status(404).json({ error: `Nessun dato aggregato per ${date}` });
        return;
    }
    res.json({
        date,
        messages: day.teams,
    });
});

signalsRouter.get('/:date/browser', async (req, res) => {
    const { date } = req.params;
    const day = await loadDay(date);
    if (!day) {
        res.status(404).json({ error: `Nessun dato aggregato per ${date}` });
        return;
    }
    const visits = day.browserVisits;

    // Group by domain (hostname only)
    const domainMap = new Map<string, number>();
    for (const v of visits) {
        try {
            const host = new URL(v.url).hostname;
            domainMap.set(host, (domainMap.get(host) ?? 0) + 1);
        } catch {
            domainMap.set('unknown', (domainMap.get('unknown') ?? 0) + 1);
        }
    }
    const sorted = [...domainMap.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20);
    const maxVisits = sorted[0]?.[1] ?? 1;
    const byDomain  = sorted.map(([domain, count]) => ({
        domain,
        visits: count,
        pct:    Math.round(count / maxVisits * 100),
    }));

    res.json({
        date,
        visits,
        byDomain,
        totalVisits:  visits.length,
        totalDomains: domainMap.size,
    });
});
