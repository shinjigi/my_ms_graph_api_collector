// Shared week data types — API contract between the Express server and the Vue frontend.

import type { ZucchettiDay, WorkLocation } from './zucchetti';
import type {
  NibolBooking,
  CalendarEventRaw,
  EmailRaw,
  TeamsMessageRaw,
  SvnCommitRaw,
  GitCommitRaw,
  BrowserVisit,
} from './aggregator';

export interface WeekDayData {
    date:           string;
    isWorkday:      boolean;
    oreTarget:      number;
    location:       WorkLocation;
    nibol:          NibolBooking | null;
    holiday:        boolean;
    holidayName?:   string;
    zucchetti:      ZucchettiDay | null;
    calendar:       CalendarEventRaw[];
    emails:         EmailRaw[];
    teams:          TeamsMessageRaw[];
    svnCommits:     SvnCommitRaw[];
    gitCommits:     GitCommitRaw[];
    browserVisits:  BrowserVisit[];
}

export interface ApiWeekResponse {
  monday: string;
  days: WeekDayData[];
}
