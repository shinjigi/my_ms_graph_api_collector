/**
 * Frontend API client for week data, TP hours, and Zucchetti automation.
 * Endpoints are proxied via Vite: /api → http://localhost:3001
 */
import type {
    ApiWeekResponse, ApiTpWeekResponse, SubmitEdit, SubmitResult,
    ZucchettiRequestResult, AnalyzeStartResponse, AnalysisJobStatus, DayProposal,
} from './types';

export async function fetchWeek(date: string): Promise<ApiWeekResponse> {
    const res = await fetch(`/api/week/${date}`);
    if (!res.ok) {
        throw new Error(`fetchWeek(${date}): ${res.status} ${res.statusText}`);
    }
    return res.json();
}

export async function fetchTpWeekHours(date: string): Promise<ApiTpWeekResponse> {
    const res = await fetch(`/api/week/${date}/tp-hours`);
    if (!res.ok) {
        throw new Error(`fetchTpWeekHours(${date}): ${res.status} ${res.statusText}`);
    }
    return res.json();
}

export async function submitWeekHours(monday: string, edits: SubmitEdit[]): Promise<SubmitResult> {
    const res = await fetch(`/api/week/${monday}/submit`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ edits }),
    });
    if (!res.ok) {
        throw new Error(`submitWeekHours: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

export interface ZucchettiRequestPayload {
    date:     string;
    type:     string;
    fullDay:  boolean;
    hours?:   number;
    minutes?: number;
}

export async function submitZucchettiRequest(payload: ZucchettiRequestPayload): Promise<ZucchettiRequestResult> {
    const res = await fetch('/api/zucchetti/request', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(payload),
    });
    if (!res.ok) {
        throw new Error(`submitZucchettiRequest: ${res.status} ${res.statusText}`);
    }
    return res.json();
}

// --- Analysis API ---

export async function analyzeDay(date: string, force = false): Promise<AnalyzeStartResponse> {
    const url = `/api/analyze/${date}${force ? '?force=true' : ''}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `analyzeDay: ${res.status}`);
    }
    return res.json();
}

export async function analyzeWeek(date: string, force = false): Promise<AnalyzeStartResponse> {
    const url = `/api/analyze/week/${date}${force ? '?force=true' : ''}`;
    const res = await fetch(url, { method: 'POST' });
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? `analyzeWeek: ${res.status}`);
    }
    return res.json();
}

export async function pollAnalysisStatus(jobId: string): Promise<AnalysisJobStatus> {
    const res = await fetch(`/api/analyze/status/${jobId}`);
    if (!res.ok) {
        throw new Error(`pollAnalysisStatus: ${res.status}`);
    }
    return res.json();
}

export async function fetchProposal(date: string): Promise<{ proposal: DayProposal; signals: unknown } | null> {
    const res = await fetch(`/api/proposals/${date}`);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`fetchProposal: ${res.status}`);
    return res.json();
}
