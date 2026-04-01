// --- Activity Portal types ---

// --- Shared types (re-exported from @shared/* for single-import convenience) ---

import type { ProposalEntry, DayProposal, AnalysisJobStatus, AnalyzeStartResponse } from "@shared/analysis";
import type { SubmitEdit, ZucchettiRequestResult } from "@shared/submit";
import type { WeekDayData, ApiWeekResponse } from "@shared/week";
import type { TpWeekEntry as ApiTpWeekEntry, TpWeekResponse as ApiTpWeekResponse } from "@shared/targetprocess";
import type { ZucchettiDay, WorkLocation } from "@shared/zucchetti";
import type { NibolBooking, TeamsMessageRaw, BrowserVisit } from "@shared/aggregator";

export type {
  ProposalEntry, DayProposal, AnalysisJobStatus, AnalyzeStartResponse,
  SubmitEdit, ZucchettiRequestResult,
  WeekDayData, ApiWeekResponse,
  ApiTpWeekEntry, ApiTpWeekResponse,
  ZucchettiDay, WorkLocation,
  NibolBooking, TeamsMessageRaw, BrowserVisit
};

export type CellMode =
    | 'clean'        // nessun hint, nessun edit
    | 'hint-only'    // hint AI presente, non ancora toccato dall'utente
    | 'hint-match'   // utente ha accettato o inserito lo stesso valore
    | 'hint-differ'  // utente ha inserito un valore diverso
    | 'user-edit';   // utente ha editato, nessun hint

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
  location?: WorkLocation;
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


// Retro-compatibility for FE components
export type WeekDayResponse = WeekDayData;

// --- FE-only types ---

export interface SubmitResult {
  submitted: number;
  errors: Array<{ tpId: number; date: string; error: string }>;
}
