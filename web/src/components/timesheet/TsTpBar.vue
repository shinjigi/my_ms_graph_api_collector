<template>
    <div class="flex items-center gap-2">
        <span class="text-xs text-base-content/35 font-medium uppercase tracking-wide mr-1">TargetProcess</span>

        <button class="btn btn-xs btn-outline btn-warning"
                @click="$emit('open-verifica')">
            Verifica
        </button>

        <button class="btn btn-xs btn-outline btn-secondary gap-1"
                :disabled="analysis.isRunning"
                @click="runWeekAnalysis"
                title="Analizza tutti i giorni della settimana con AI">
            <span v-if="analysis.isRunning" class="loading loading-spinner loading-xs"></span>
            <svg v-else class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
            </svg>
            Analizza
        </button>

        <button class="btn btn-xs btn-outline btn-primary gap-1"
                :disabled="submitDisabled || submitting"
                @click="runSubmit"
                :title="submitDisabled ? 'Nessuna modifica da inviare' : 'Invia ore a TargetProcess'">
            <span v-if="submitting" class="loading loading-spinner loading-xs"></span>
            <span v-else>Invia a TP</span>
            <span v-if="pendingEditsCount > 0" class="badge badge-xs badge-primary">{{ pendingEditsCount }}</span>
        </button>

        <!-- Reset button: visible only when there are pending edits -->
        <button v-if="pendingEditsCount > 0 && !submitting"
                class="btn btn-xs btn-ghost text-error/60 hover:text-error"
                @click="ts.clearEdits()"
                title="Annulla tutte le modifiche non inviate">
            ✕ reset
        </button>

        <!-- Feedback messages -->
        <span v-if="validationError" class="text-xs text-warning truncate max-w-60" :title="validationError">
            ⚠ {{ validationError }}
        </span>
        <span v-else-if="analysis.error" class="text-xs text-error truncate max-w-40" :title="analysis.error">
            ✗ {{ analysis.error }}
        </span>
        <span v-else-if="analysis.isRunning" class="text-xs text-secondary">
            Analisi {{ analysisPct }}...
        </span>
        <span v-else-if="analysisDoneMsg" class="text-xs text-success">
            {{ analysisDoneMsg }}
        </span>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useTimesheetStore }    from '../../stores/useTimesheetStore';
import { useAnalysisStore }     from '../../stores/useAnalysisStore';
import { usePickerStore }       from '../../stores/usePickerStore';

defineEmits<{ (e: 'open-verifica'): void }>();

const ts       = useTimesheetStore();
const analysis = useAnalysisStore();
const picker   = usePickerStore();

// ---- Analysis ----

function selectedDateStr(): string {
    const d = picker.pickerSelected;
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const dd  = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${dd}`;
}

function runWeekAnalysis() {
    const monday = ts.currentMonday || selectedDateStr();
    analysis.runWeek(monday);
}

const analysisPct = computed(() => {
    const s = analysis.status;
    if (!s) return '';
    const done = Object.keys(s.completed).length + Object.keys(s.errors).length;
    return `${done}/${s.dates.length}`;
});

const analysisDoneMsg = ref('');

watch(() => analysis.status?.status, (newStatus) => {
    if (newStatus === 'done') {
        const count = Object.keys(analysis.status?.completed ?? {}).length;
        analysisDoneMsg.value = `✓ ${count} giorni analizzati`;
        setTimeout(() => { analysisDoneMsg.value = ''; }, 8000);
    }
});

// ---- Submit to TP ----

const submitting    = ref(false);
const submitMsg     = ref('');
const submitMsgCls  = ref('text-success');
const validationError = ref('');

const pendingEditsCount = computed(() =>
    Object.values(ts.hoursEdits).filter(h => h > 0).length
);

const submitDisabled = computed(() => pendingEditsCount.value === 0 || submitting.value);

/** Returns the number of hour entries that are missing a description. */
function countMissingNotes(): number {
    let missing = 0;
    for (const [key, hours] of Object.entries(ts.hoursEdits)) {
        if (!hours || hours <= 0) continue;
        if (!(ts.noteEdits[key] ?? '').trim()) missing++;
    }
    return missing;
}

async function runSubmit() {
    if (submitDisabled.value) return;
    validationError.value = '';
    const missing = countMissingNotes();
    if (missing > 0) {
        validationError.value = `${missing} entr${missing > 1 ? 'ate' : 'ata'} senza descrizione`;
        setTimeout(() => { validationError.value = ''; }, 6000);
        return;
    }
    submitting.value = true;
    submitMsg.value  = '';
    try {
        const result = await ts.submitWeekHours();
        if (result.errors.length === 0) {
            submitMsg.value    = `✓ ${result.submitted} ore inviate a TP`;
            submitMsgCls.value = 'text-success';
        } else {
            submitMsg.value    = `⚠ ${result.submitted} ok, ${result.errors.length} errori`;
            submitMsgCls.value = 'text-warning';
        }
    } catch (err) {
        submitMsg.value    = `✗ Errore: ${(err as Error).message}`;
        submitMsgCls.value = 'text-error';
    } finally {
        submitting.value = false;
    }
}

defineExpose({ submitMsg, submitMsgCls });
</script>
