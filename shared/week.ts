// Shared week data types — API contract between the Express server and the Vue frontend.

import type { ZucchettiDay } from './zucchetti';

export interface WeekDayData {
    date:           string;
    isWorkday:      boolean;
    oreTarget:      number;
    location:       string;
    nibol:          string | null;
    holiday:        boolean;
    holidayName?:   string;
    zucchetti:      ZucchettiDay | null;
    calendar:       unknown[];
    emails:         unknown[];
    teams:          unknown[];
    svnCommits:     unknown[];
    gitCommits:     unknown[];
    browserVisits:  unknown[];
}
