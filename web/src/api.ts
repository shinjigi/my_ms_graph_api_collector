/**
 * Frontend API client for week data and TP hours.
 * Endpoints are proxied via Vite: /api → http://localhost:3001
 */
import type { ApiWeekResponse, ApiTpWeekResponse, SubmitEdit, SubmitResult } from './types';

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
