// Shared week data types — API contract between the Express server and the Vue frontend.

import type { ZucchettiDay, WorkLocation } from './zucchetti';
import type {
    NibolBooking,
    SvnCommitRaw,
    GitCommitRaw,
    BrowserVisit,
} from './aggregator';
import { CalendarEventRaw, EmailRaw, TeamsChatDataRaw } from './graph';


export interface WeekDayData {
    date:           Date;
    isWorkday:      boolean;
    oreTarget:      number;
    location:       WorkLocation;
    nibol:          NibolBooking | null;
    holiday:        boolean;
    holidayName?:   string;
    zucchetti:      ZucchettiDay | null;
    calendar:       CalendarEventRaw[];
    emails:         EmailRaw[];
    teams:          TeamsChatDataRaw[];
    svnCommits:     SvnCommitRaw[];
    gitCommits:     GitCommitRaw[];
    browserVisits:  BrowserVisit[];
}

export interface ApiWeekResponse {
  monday: Date;
  days: WeekDayData[];
}
