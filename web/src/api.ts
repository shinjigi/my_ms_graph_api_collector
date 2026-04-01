/**
 * Frontend API client for week data, TP hours, and Zucchetti automation.
 * Endpoints are proxied via Vite: /api → http://localhost:3001
 */
import type {
  ApiWeekResponse,
  ApiTpWeekResponse,
  SubmitEdit,
  SubmitResult,
  ZucchettiRequestResult,
  AnalyzeStartResponse,
  AnalysisJobStatus,
  DayProposal,
  BrowserDomain,
} from "./types";
import { shiftDate } from "@shared/dates";

export async function fetchWeek(date: string): Promise<ApiWeekResponse> {
  const res = await fetch(`/api/week/${date}`);
  if (!res.ok) {
    throw new Error(`fetchWeek(${date}): ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export async function fetchTpWeekHours(
  date: string,
): Promise<ApiTpWeekResponse> {
  const res = await fetch(`/api/week/${date}/tp-hours`);
  if (!res.ok) {
    throw new Error(
      `fetchTpWeekHours(${date}): ${res.status} ${res.statusText}`,
    );
  }
  return res.json();
}

export async function submitWeekHours(
  monday: string,
  edits: SubmitEdit[],
): Promise<SubmitResult> {
  const res = await fetch(`/api/week/${monday}/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ edits }),
  });
  if (!res.ok) {
    throw new Error(`submitWeekHours: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

export interface ZucchettiRequestPayload {
  date: string;
  type: string;
  fullDay: boolean;
  hours?: number;
  minutes?: number;
}

export async function submitZucchettiRequest(
  payload: ZucchettiRequestPayload,
): Promise<ZucchettiRequestResult> {
  const res = await fetch("/api/zucchetti/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`submitZucchettiRequest: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

// --- Analysis API ---

export async function analyzeDay(
  date: string,
  force = false,
): Promise<AnalyzeStartResponse> {
  const url = `/api/analyze/${date}${force ? "?force=true" : ""}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `analyzeDay: ${res.status}`);
  }
  return res.json();
}

export async function analyzeWeek(
  date: string,
  force = false,
): Promise<AnalyzeStartResponse> {
  const url = `/api/analyze/week/${date}${force ? "?force=true" : ""}`;
  const res = await fetch(url, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `analyzeWeek: ${res.status}`);
  }
  return res.json();
}

export async function pollAnalysisStatus(
  jobId: string,
): Promise<AnalysisJobStatus> {
  const res = await fetch(`/api/analyze/status/${jobId}`);
  if (!res.ok) {
    throw new Error(`pollAnalysisStatus: ${res.status}`);
  }
  return res.json();
}

// --- Signals API ---

export interface CommitsResponse {
  date: string;
  gitCommits: {
    hash: string;
    author: string;
    email: string;
    date: string;
    message: string;
    repo: string;
  }[];
  svnCommits: {
    revision: string;
    author: string;
    date: string;
    message: string;
    paths: string[];
  }[];
}

export interface TeamsMessage {
  id: string;
  chatId: string;
  chatTopic: string | null;
  createdDateTime: string;
  body: { contentType: string; content: string };
  webUrl: string | null;
}

export interface TeamsResponse {
  date: string;
  messages: TeamsMessage[];
}

export type { BrowserDomain } from "./types";

export interface BrowserResponse {
  date: string;
  totalVisits: number;
  totalDomains: number;
  byDomain: BrowserDomain[];
  visits: {
    visitId: string;
    source: string;
    url: string;
    title: string | null;
    visitTime: string;
  }[];
}

export async function fetchDayCommits(date: string): Promise<CommitsResponse> {
  const res = await fetch(`/api/day/${date}/commits`);
  if (!res.ok) throw new Error(`fetchDayCommits(${date}): ${res.status}`);
  return res.json();
}

export async function fetchDayTeams(date: string): Promise<TeamsResponse> {
  const res = await fetch(`/api/day/${date}/teams`);
  if (!res.ok) throw new Error(`fetchDayTeams(${date}): ${res.status}`);
  return res.json();
}

export async function fetchDayBrowser(date: string): Promise<BrowserResponse> {
  const res = await fetch(`/api/day/${date}/browser`);
  if (!res.ok) throw new Error(`fetchDayBrowser(${date}): ${res.status}`);
  return res.json();
}

export interface SyncResult {
  synced:     string[];
  skipped:    string[];
  aggregated: string[];
  errors:     string[];
}

export async function syncData(
  scope: "day" | "week",
  date: string,
  force = false,
): Promise<SyncResult> {
  const res = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ scope, date, force }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `syncData: ${res.status}`);
  }
  return res.json();
}

export async function fetchProposal(
  date: string,
): Promise<{ proposal: DayProposal; signals: unknown } | null> {
  const res = await fetch(`/api/proposals/${date}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`fetchProposal: ${res.status}`);
  return res.json();
}

export async function fetchWeekProposals(
  monday: string,
): Promise<Record<string, DayProposal>> {
  const dates = [0, 1, 2, 3, 4].map((i) => shiftDate(monday, i));
  const results = await Promise.allSettled(dates.map((d) => fetchProposal(d)));
  const map: Record<string, DayProposal> = {};
  for (let i = 0; i < 5; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value?.proposal)
      map[dates[i]] = r.value.proposal;
  }
  return map;
}

export async function saveProposal(date: string, patch: Partial<DayProposal>): Promise<DayProposal> {
  const res = await fetch(`/api/proposals/${date}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) throw new Error(`saveProposal: ${res.status}`);
  return res.json();
}
