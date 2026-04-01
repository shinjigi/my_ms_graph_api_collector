<template>
    <div class="flex items-center gap-2">
        <TpSubmitPopover ref="submitPopover" />

        <span class="text-xs text-base-content/35 font-medium uppercase tracking-wide mr-1">TargetProcess</span>

        <button class="btn btn-xs btn-outline btn-warning"
                @click="$emit('open-verifica')">
            Verifica
        </button>

        <button class="btn btn-xs btn-outline btn-secondary gap-1"
                :disabled="analysis.isRunning"
                @click="runWeekAnalysis(false)"
                @click.shift.stop="runWeekAnalysis(true)"
                title="Analizza settimana con AI · Shift+click per forzare rigenerazione">
            <span v-if="analysis.isRunning" class="loading loading-spinner loading-xs"></span>
            <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            Analizza
        </button>

        <button class="btn btn-xs btn-outline btn-primary gap-1"
                :disabled="pendingEditsCount === 0"
                @click="submitPopover?.open()"
                :title="pendingEditsCount === 0 ? 'Nessuna modifica da inviare' : 'Invia ore a TargetProcess'">
            Invia a TP
            <span v-if="pendingEditsCount > 0" class="badge badge-xs badge-primary">{{ pendingEditsCount }}</span>
        </button>

        <!-- Feedback messages -->
        <span v-if="analysis.error" class="text-xs text-error truncate max-w-40" :title="analysis.error">
            ✗ {{ analysis.error }}
        </span>
        <span v-else-if="analysis.isRunning" class="text-xs text-secondary">
            Analisi {{ analysisPct }}...
        </span>
        <template v-else-if="analysisDoneMsg">
            <span class="text-xs text-success">{{ analysisDoneMsg }}</span>
            <button v-if="alreadyDone"
                    class="btn btn-xs btn-ghost text-secondary gap-0.5 -ml-1"
                    :disabled="analysis.isRunning"
                    @click="runWeekAnalysis(true)"
                    title="Rigenera i proposal anche se già presenti">
                ↺ Rigenera
            </button>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useTimesheetStore }    from '../../stores/useTimesheetStore';
import { useAnalysisStore }     from '../../stores/useAnalysisStore';
import { usePickerStore }       from '../../stores/usePickerStore';
import TpSubmitPopover          from './TpSubmitPopover.vue';
import { dateToString }         from '@shared/dates';

defineEmits<{ (e: 'open-verifica'): void }>();

const ts       = useTimesheetStore();
const analysis = useAnalysisStore();
const picker   = usePickerStore();

const submitPopover = ref<InstanceType<typeof TpSubmitPopover> | null>(null);

// ---- Analysis ----

function selectedDateStr(): string {
    return dateToString(picker.pickerSelected);
}

function runWeekAnalysis(force = false) {
    const monday = ts.currentMonday || selectedDateStr();
    analysis.runWeek(monday, force);
}

const analysisPct = computed(() => {
    const s = analysis.status;
    if (!s) return '';
    const done = Object.keys(s.completed).length + Object.keys(s.errors).length;
    return `${done}/${s.dates.length}`;
});

const analysisDoneMsg = ref('');
const alreadyDone     = ref(false);

watch(() => analysis.status?.status, (newStatus) => {
    if (newStatus === 'done') {
        const s     = analysis.status;
        const count = Object.keys(s?.completed ?? {}).length;
        const errs  = Object.keys(s?.errors ?? {}).length;
        if (count > 0) {
            analysisDoneMsg.value = `✓ ${count} giorni analizzati`;
            alreadyDone.value     = false;
        } else if (errs === 0) {
            analysisDoneMsg.value = '✓ Già analizzato';
            alreadyDone.value     = true;
        }
        // Reload hints from baseline files now that analysis is done
        analysis.loadWeekHints(ts.currentMonday || selectedDateStr());
        setTimeout(() => { analysisDoneMsg.value = ''; alreadyDone.value = false; }, 10000);
    }
});

// ---- Pending count ----

const pendingEditsCount = computed(() => {
    const editCount = Object.values(ts.hoursEdits).filter(h => h > 0).length;
    const monday    = ts.currentMonday;
    if (!monday) return editCount;

    let hintCount = 0;
    for (let i = 0; i < 5; i++) {
        // Skip days that are already balanced (total reported = target)
        if (Math.abs(ts.totalsRow.delta[i]) < 0.05) continue;

        for (const row of [...ts.active, ...ts.pinned]) {
            if (`${row.tpId}_${i}` in ts.hoursEdits) continue;
            const hint = analysis.getHint(row.tpId, i, monday);
            if (hint && hint.inferredHours > 0) {
                hintCount++;
            }
        }
    }
    return editCount + hintCount;
});
</script>
