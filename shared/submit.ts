// Shared submit/result types — used by the server routes and the Vue frontend.

import type { WeekDayData } from './week';

export interface SubmitEdit {
    tpId:        number;
    dayIdx:      number;
    hours:       number;
    date:        string;       // YYYY-MM-DD
    description: string;
}

export interface ZucchettiRequestResult {
    success:      boolean;
    message:      string;
    skipped?:     boolean;       // true if activity already existed
    scrapeError?: string;        // non-null if post-submit scrape failed
    dayUpdate?:   WeekDayData;   // re-aggregated day data for frontend
}
