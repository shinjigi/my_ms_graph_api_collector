import { CalendarEventRaw, EmailRaw, TeamsChatDataRaw } from "./graph";
import { ZucchettiDay, WorkLocation } from "./zucchetti";

export interface NibolBooking {
    date: Date;
    type: string; // e.g. "office", "home", "external"
    details?: string;
}

export interface BrowserVisit {
  visitId: string; // "<source>-<id>" to avoid collisions across profiles
  source: string; // e.g. "chrome-profile1", "firefox"
  url: string;
  title: string | null;
  visitTime: string; // ISO 8601
  date: Date;
}


export interface GitCommitRaw {
  hash: string;
  author: string;
  email: string;
  date: Date;
  message: string;
  repo: string;
  paths: string[];
}

export interface SvnCommitRaw {
  revision: string;
  author: string;
  date: Date;
  message: string;
  paths: string[];
}

export interface AggregatedDay {
  date: Date;
  isWorkday: boolean;
  isComplete: boolean; // True if the day has ended and all data is final
  oreTarget: number; // decimal hours from Zucchetti hOrd
  location: WorkLocation;
  nibol: NibolBooking | null;
  zucchetti: ZucchettiDay | null;
  calendar: CalendarEventRaw[];
  emails: EmailRaw[];
  teams: TeamsChatDataRaw[];
  svnCommits: SvnCommitRaw[];
  gitCommits: GitCommitRaw[];
  browserVisits: BrowserVisit[];
  reportedHours?: Record<number, number>; // taskId -> hours already in TargetProcess
}
