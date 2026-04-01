import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { getTimeString, shiftDate, dateToString, getMonday } from '@shared/dates';
import { analyzeDay, analyzeWeek, pollAnalysisStatus, fetchProposal, fetchWeekProposals } from '../api';
import type { DayProposal, AnalysisJobStatus } from '../types';
import type { ProposalEntry } from '@shared/analysis';

const POLL_INTERVAL = 2000;

export const useAnalysisStore = defineStore('analysis', () => {
    const jobId     = ref<string | null>(null);
    const status    = ref<AnalysisJobStatus | null>(null);
    const busy      = ref(false);
    const error     = ref<string | null>(null);
    const proposal  = ref<DayProposal | null>(null);
    // Week-scoped hint map: key = 'YYYY-MM-DD' → DayProposal
    const weekHints = ref<Record<string, DayProposal>>({});

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const isRunning = computed(() =>
        busy.value || status.value?.status === 'pending' || status.value?.status === 'running'
    );


    const provider = computed(() => proposal.value?.provider ?? null);

    const lastRun = computed(() => {
        if (!proposal.value?.generatedAt) return null;
        return getTimeString(new Date(proposal.value.generatedAt), ":").substring(0, 5);
    });

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function loadWeekHints(monday: string): Promise<void> {
        weekHints.value = await fetchWeekProposals(monday);
    }

    function getHint(tpId: number, dayIdx: number, monday: string): ProposalEntry | null {
        const date = shiftDate(monday, dayIdx);
        const hint = weekHints.value[date]?.entries.find(e => e.taskId === tpId) ?? null;
        if (hint?.status === 'dismissed') return null;
        return hint;
    }

    async function setEntryStatus(date: string, tpId: number, status: ProposalEntry['status']): Promise<void> {
        const prop = weekHints.value[date];
        if (!prop) return;

        const entry = prop.entries.find(e => e.taskId === tpId);
        if (!entry) return;

        entry.status = status;
        const { saveProposal } = await import('../api');
        await saveProposal(date, { entries: prop.entries });
    }

    function dismissHint(tpId: number, dayIdx: number, monday: string): void {
        const date = shiftDate(monday, dayIdx);
        setEntryStatus(date, tpId, 'dismissed');
    }

    function clearWeekHints(): void {
        weekHints.value = {};
    }

    function clearDayHints(dayIdx: number, monday: string): void {
        const date = shiftDate(monday, dayIdx);
        const copy = { ...weekHints.value };
        delete copy[date];
        weekHints.value = copy;
    }

    async function poll() {
        if (!jobId.value) return;
        try {
            const res = await pollAnalysisStatus(jobId.value);
            status.value = res;
            if (res.status === 'done' || res.status === 'error') {
                stopPolling();
                busy.value = false;

                // Pick the first completed proposal (for dashboard StatStrip card)
                const dates = Object.keys(res.completed);
                if (dates.length > 0) {
                    proposal.value = res.completed[dates[0]];
                }

                // Reload week hints from disk after analysis completes
                const firstDate = res.dates?.[0];
                if (firstDate) {
                    const monday = dateToString(getMonday(new Date(firstDate)));
                    loadWeekHints(monday);
                }

                if (res.status === 'error') {
                    const errKeys = Object.keys(res.errors);
                    error.value = errKeys.length > 0
                        ? res.errors[errKeys[0]]
                        : 'Errore analisi sconosciuto';
                }
            }
        } catch (err) {
            error.value = (err as Error).message;
            stopPolling();
            busy.value = false;
        }
    }

    function startPolling() {
        stopPolling();
        pollTimer = setInterval(poll, POLL_INTERVAL);
    }

    async function runDay(date: string, force = false) {
        error.value    = null;
        busy.value     = true;
        status.value   = null;
        proposal.value = null;

        try {
            const res  = await analyzeDay(date, force);
            jobId.value = res.jobId;
            startPolling();
        } catch (err) {
            error.value = (err as Error).message;
            busy.value  = false;
        }
    }

    async function runWeek(date: string, force = false) {
        error.value    = null;
        busy.value     = true;
        status.value   = null;
        proposal.value = null;

        try {
            const res  = await analyzeWeek(date, force);
            jobId.value = res.jobId;
            startPolling();
        } catch (err) {
            error.value = (err as Error).message;
            busy.value  = false;
        }
    }

    async function loadProposal(date: string) {
        try {
            const res = await fetchProposal(date);
            proposal.value = res?.proposal ?? null;
        } catch {
            proposal.value = null;
        }
    }

    function $reset() {
        stopPolling();
        jobId.value    = null;
        status.value   = null;
        busy.value     = false;
        error.value    = null;
        proposal.value = null;
    }

    return {
        jobId, status, busy, error, proposal,
        isRunning, provider, lastRun,
        weekHints,
        loadWeekHints, getHint, dismissHint, setEntryStatus, clearWeekHints, clearDayHints,
        runDay, runWeek, loadProposal, $reset,
    };
});
