// --- Activity Portal types ---

import { DayProposal } from "@shared/analysis";

export interface Holiday {
  m: number;
  d: number;
  name: string;
}

export interface Day {
  label: string;
  date: string;
  rend: "ok" | "warn" | "err" | null;
  zucHours: number;
  location?: "office" | "smart" | "travel" | "external" | "mixed" | "unknown";
  nibol: NibolBooking | null;
  holiday: boolean;
  holidayName?: string;
}

export type TsRowState = "Inception" | "Dev/Unit test" | "Testing";

export interface TsRow {
  project: string;
  us: string;
  tpId: number;
  state: string;
  totAllTime: number;
  hours?: number[];
  git?: number[];
  svn?: number[];
  notes?: (string | null)[];
  rem?: number;
}

export interface UsCard {
  us: string;
  tpId: number;
  state: string;
  tpHours: number;
  zucHours: number;
  zucPercent?: number;
  emails: number;
  commits: number;
  meetings: number;
  color: string;
  note: string;
}

export type TlEventType =
  | "meeting"
  | "commit"
  | "svn"
  | "email-in"
  | "email-out";

export interface TlEvent {
  type: TlEventType;
  time: string;
  label: string;
  top: number;
  h: number;
  emailId?: number;
  corrUs?: string;
}

export interface Email {
  dir: "in" | "out";
  from: string;
  to: string;
  subject: string;
  time: string;
  body: string;
}

export type ActiveView =
  | "dashboard"
  | "timesheet"
  | "activity"
  | "teams"
  | "browser";

export interface QuickSortState {
  field: "state" | "ore" | "chiusura";
  dir: 1 | -1;
}

export interface BrowserDomain {
  domain: string;
  visits: number;
  pct: number;
}

/** UsCard enriched with timesheet-level fields for the quick-log list. */
export interface QuickLogItem extends UsCard {
  totAllTime: number;
  rem?: number;
}

// --- Shared types (re-exported from @shared/* for single-import convenience) ---

export type { ProposalEntry, DayProposal } from "@shared/analysis";
export type { SubmitEdit, ZucchettiRequestResult } from "@shared/submit";
export type { WeekDayData } from "@shared/week";
export type { ZucchettiDay } from "@shared/zucchetti";
export type {
  NibolBooking,
  TeamsMessageRaw,
  BrowserVisit,
} from "@shared/aggregator";

// --- API Response Types (from backend) ---

import type { ZucchettiDay } from "@shared/zucchetti";
import type {
  NibolBooking,
  TeamsMessageRaw,
  BrowserVisit,
  EmailRaw,
  CalendarEventRaw,
  GitCommitRaw,
  SvnCommitRaw,
} from "@shared/aggregator";

/** FE-specific version of WeekDayData with typed signal arrays. */
export interface WeekDayResponse {
  date: string;
  isWorkday: boolean;
  oreTarget: number;
  location: "office" | "smart" | "travel" | "external" | "mixed" | "unknown";
  nibol: NibolBooking | null;
  holiday: boolean;
  holidayName?: string;
  zucchetti: ZucchettiDay | null;
  calendar: CalendarEventRaw[];
  emails: EmailRaw[];
  teams: TeamsMessageRaw[];
  svnCommits: SvnCommitRaw[];
  gitCommits: GitCommitRaw[];
  browserVisits: BrowserVisit[];
}

export interface ApiWeekResponse {
  monday: string;
  days: WeekDayResponse[];
}

export interface ApiTpWeekEntry {
  tpId: number;
  usName: string;
  stateName: string;
  timeSpent: number;
  projectName: string;
  hours: number[];
}

export interface ApiTpWeekResponse {
  userId: number;
  userName: string;
  entries: ApiTpWeekEntry[];
  openItems: unknown[];
}

// --- Submit result (FE-only, not in shared) ---

export interface SubmitResult {
  submitted: number;
  errors: Array<{ tpId: number; date: string; error: string }>;
}

export interface AnalysisJobStatus {
  status: "pending" | "running" | "done" | "error";
  dates: string[];
  completed: Record<string, DayProposal>;
  errors: Record<string, string>;
  startedAt: string;
}

export interface AnalyzeStartResponse {
  jobId: string;
  dates?: string[];
}
