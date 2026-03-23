import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { analyzeDay, analyzeWeek, pollAnalysisStatus, fetchProposal } from '../api';
import type { DayProposal, AnalysisJobStatus } from '../types';

const POLL_INTERVAL = 2000;

export const useAnalysisStore = defineStore('analysis', () => {
    const jobId    = ref<string | null>(null);
    const status   = ref<AnalysisJobStatus | null>(null);
    const busy     = ref(false);
    const error    = ref<string | null>(null);
    const proposal = ref<DayProposal | null>(null);

    let pollTimer: ReturnType<typeof setInterval> | null = null;

    const isRunning = computed(() =>
        busy.value || status.value?.status === 'pending' || status.value?.status === 'running'
    );

    const provider = computed(() => proposal.value?.provider ?? null);

    const lastRun = computed(() => {
        if (!proposal.value?.generatedAt) return null;
        const d = new Date(proposal.value.generatedAt);
        const hh = String(d.getHours()).padStart(2, '0');
        const mm = String(d.getMinutes()).padStart(2, '0');
        return `${hh}:${mm}`;
    });

    function stopPolling() {
        if (pollTimer) {
            clearInterval(pollTimer);
            pollTimer = null;
        }
    }

    async function poll() {
        if (!jobId.value) return;
        try {
            const res = await pollAnalysisStatus(jobId.value);
            status.value = res;
            if (res.status === 'done' || res.status === 'error') {
                stopPolling();
                busy.value = false;

                // Pick the first completed proposal
                const dates = Object.keys(res.completed);
                if (dates.length > 0) {
                    proposal.value = res.completed[dates[0]];
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
        runDay, runWeek, loadProposal, $reset,
    };
});
