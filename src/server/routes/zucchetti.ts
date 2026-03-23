/**
 * Zucchetti automation routes.
 * POST /api/zucchetti/request — submit an activity request via Playwright.
 *
 * Re-aggregation after submit is handled internally by postSubmitScrape()
 * in updateData.ts (when scrapeAfterSubmit is true).
 */
import { Router, Request, Response } from 'express';
import { submitZucchettiRequest, validActivities } from '../../collectors/zucchetti/updateData';
import type { ZucchettiRequestParams } from '../../collectors/zucchetti/updateData';

export const zucchettiRouter = Router();

// GET /api/zucchetti/activities — list valid activity types
zucchettiRouter.get('/activities', (_req: Request, res: Response) => {
    res.json({ activities: validActivities });
});

// POST /api/zucchetti/request — submit activity via Playwright
zucchettiRouter.post('/request', async (req: Request, res: Response) => {
    try {
        const body = req.body as Partial<ZucchettiRequestParams>;

        if (!body.date || !body.type) {
            res.status(400).json({ success: false, message: 'date and type are required.' });
            return;
        }

        const params: ZucchettiRequestParams = {
            date:              body.date,
            type:              body.type,
            fullDay:           body.fullDay ?? false,
            hours:             body.hours ?? 0,
            minutes:           body.minutes ?? 0,
            scrapeAfterSubmit: true,   // Always scrape when called from API
        };

        console.log(`[zucchetti-route] Request: ${params.type} on ${params.date} (fullDay=${params.fullDay})`);
        const result = await submitZucchettiRequest(params);

        res.json(result);
    } catch (err) {
        console.error('[zucchetti-route] Unexpected error:', err);
        res.status(500).json({ success: false, message: (err as Error).message });
    }
});
