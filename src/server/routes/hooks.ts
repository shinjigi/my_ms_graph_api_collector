/**
 * POST /api/hooks/zucchetti  → run Zucchetti update_data.js via child_process
 * POST /api/hooks/nibol      → run Nibol Playwright automation
 * GET  /api/hooks/tp-items   → return open TP items for the task panel
 * GET  /api/hooks/tp-search  → search TP items by keyword
 */
import { Router, Request, Response } from 'express';
import { spawn }  from 'child_process';
import * as path  from 'path';
import { TargetprocessClient } from '../../targetprocess/client';
import { nibolBookDesk, nibolCheckIn } from '../../collectors/nibol';

export const hooksRouter = Router();

function runNode(scriptPath: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
        const out: string[] = [];
        const err: string[] = [];
        const proc = spawn(process.execPath, [scriptPath, ...args], { env: { ...process.env } });

        proc.stdout.on('data', (c: Buffer) => out.push(c.toString()));
        proc.stderr.on('data', (c: Buffer) => err.push(c.toString()));
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Exit ${code}: ${err.join('')}`));
            } else {
                resolve({ stdout: out.join(''), stderr: err.join('') });
            }
        });
        proc.on('error', reject);
    });
}

// POST /api/hooks/zucchetti
// Body: { action: 'fullDaySw' | 'halfDaySw' | 'halfDayLeave', date: 'YYYY-MM-DD' }
hooksRouter.post('/zucchetti', async (req: Request, res: Response) => {
    const { action, date } = req.body as { action: string; date: string };
    const script = path.join(process.cwd(), 'zucchetti_automation', 'update_data.js');

    const argsMap: Record<string, string[]> = {
        fullDaySw:    [`--date=${date}`, '--type=SMART WORKING', '--full-day=true'],
        halfDaySw:    [`--date=${date}`, '--type=SMART WORKING', '--hours=3', '--minutes=51'],
        halfDayLeave: [`--date=${date}`, '--type=FERIE', '--hours=3', '--minutes=51'],
    };

    const args = argsMap[action];
    if (!args) {
        res.status(400).json({ error: `Azione sconosciuta: ${action}` });
        return;
    }

    try {
        const result = await runNode(script, args);
        res.json({ ok: true, stdout: result.stdout });
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// POST /api/hooks/nibol
// Body: { action: 'bookDesk' | 'checkIn', date: 'YYYY-MM-DD' }
hooksRouter.post('/nibol', async (req: Request, res: Response) => {
    const { action, date } = req.body as { action: string; date: string };

    try {
        if (action === 'bookDesk') {
            await nibolBookDesk(date);
            res.json({ ok: true });
        } else if (action === 'checkIn') {
            await nibolCheckIn(date);
            res.json({ ok: true });
        } else {
            res.status(400).json({ error: `Azione sconosciuta: ${action}` });
        }
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// GET /api/hooks/tp-items
hooksRouter.get('/tp-items', async (_req: Request, res: Response) => {
    try {
        const client = new TargetprocessClient();
        const items  = await client.getMyAssignedOpenItems();
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});

// GET /api/hooks/tp-search?q=<keyword>
hooksRouter.get('/tp-search', async (req: Request, res: Response) => {
    const keyword = req.query['q'] as string | undefined;
    if (!keyword || keyword.length < 2) {
        res.status(400).json({ error: 'Parametro q mancante o troppo corto' });
        return;
    }

    try {
        const client = new TargetprocessClient();
        const items  = await client.searchAssignables(keyword);
        res.json(items);
    } catch (err) {
        res.status(500).json({ error: (err as Error).message });
    }
});
