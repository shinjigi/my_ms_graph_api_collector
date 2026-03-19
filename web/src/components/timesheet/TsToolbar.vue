<template>
    <div class="flex items-center justify-between mb-3">
        <div class="flex items-center gap-2">
            <div class="card-title text-sm">Timesheet settimanale · TargetProcess</div>
            <div class="badge badge-outline badge-xs">User Stories</div>
            <div class="badge badge-outline badge-xs">Tasks</div>
        </div>
        <div class="flex items-center gap-2">
            <button
                class="btn btn-xs btn-ghost gap-1"
                :class="{ 'btn-active': ui.weVisible }"
                @click="ui.toggleWE()"
                title="Mostra/nascondi weekend"
            >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                </svg>
                +WE
            </button>

            <!-- Zucchetti quick-fill: submits activity request + fills TP hours -->
            <div class="flex items-center gap-1 border-l border-base-300 pl-2">
                <span class="text-xs text-base-content/35 mr-1 shrink-0">
                    {{ selectedDayLabel ?? '–' }}
                </span>
                <button class="btn btn-xs btn-ghost"
                        :disabled="fillDisabled || zuccBusy"
                        @click="zuccAction('SMART WORKING', true, WORKDAY_HOURS)"
                        title="Zucchetti: Smart Working giornata intera (7:42) + fill TP">
                    <span v-if="zuccBusy && zuccAction_ === 'sw'" class="loading loading-spinner loading-xs"></span>
                    <span v-else>SW 7:42</span>
                </button>
                <button class="btn btn-xs btn-ghost"
                        :disabled="fillDisabled || zuccBusy"
                        @click="zuccAction('SMART WORKING', false, HALF_WORKDAY_HOURS, 3, 51)"
                        title="Zucchetti: Smart Working mezza giornata (3:51) + fill TP">
                    <span v-if="zuccBusy && zuccAction_ === 'halfsw'" class="loading loading-spinner loading-xs"></span>
                    <span v-else>½ SW</span>
                </button>
                <button class="btn btn-xs btn-ghost btn-warning opacity-70"
                        :disabled="fillDisabled || zuccBusy"
                        @click="zuccAction('FERIE', true, 0)"
                        title="Zucchetti: Ferie giornata intera + azzera TP">
                    <span v-if="zuccBusy && zuccAction_ === 'ferie'" class="loading loading-spinner loading-xs"></span>
                    <span v-else>Ferie</span>
                </button>
                <button class="btn btn-xs btn-ghost btn-warning opacity-70"
                        :disabled="fillDisabled || zuccBusy"
                        @click="zuccAction('FERIE', false, HALF_WORKDAY_HOURS, 3, 51)"
                        title="Zucchetti: Ferie mezza giornata + fill TP 3:51">
                    <span v-if="zuccBusy && zuccAction_ === 'halfferie'" class="loading loading-spinner loading-xs"></span>
                    <span v-else>½ Ferie</span>
                </button>
            </div>

            <!-- Zucchetti feedback -->
            <span v-if="zuccMsg" class="text-xs" :class="zuccMsgCls">{{ zuccMsg }}</span>

            <button
                class="btn btn-xs btn-outline btn-warning"
                @click="$emit('open-verifica')"
            >Verifica concordanza</button>

            <button
                class="btn btn-xs btn-outline btn-primary"
                :disabled="submitDisabled || submitting"
                @click="runSubmit"
                :title="submitDisabled ? 'Nessuna modifica da inviare' : 'Invia ore a TargetProcess'"
            >
                <span v-if="submitting" class="loading loading-spinner loading-xs"></span>
                <span v-else>Invia a TP</span>
                <span v-if="pendingEditsCount > 0" class="badge badge-xs badge-primary">{{ pendingEditsCount }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUiStore } from '../../stores/useUiStore';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { usePickerStore } from '../../stores/usePickerStore';
import { submitZucchettiRequest } from '../../api';
import { DAYABB_IT, WORKDAY_HOURS, HALF_WORKDAY_HOURS } from '../../mock/data';

defineEmits<{ (e: 'open-verifica'): void }>();

const ui     = useUiStore();
const ts     = useTimesheetStore();
const picker = usePickerStore();

// ---- Selected day label ----

const selectedDayLabel = computed(() => {
    const idx = picker.selectedDayIdx;
    if (idx < 0) return null;
    const d = picker.pickerSelected;
    return `${DAYABB_IT[d.getDay()]} ${d.getDate()}`;
});

const fillDisabled = computed(() => picker.selectedDayIdx < 0);

/** Compute YYYY-MM-DD for the currently selected day. */
function selectedDateStr(): string {
    const d = picker.pickerSelected;
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
}

// ---- Zucchetti automation ----

const zuccBusy    = ref(false);
const zuccAction_ = ref('');     // which button is spinning
const zuccMsg     = ref('');
const zuccMsgCls  = ref('text-success');

async function zuccAction(type: string, fullDay: boolean, tpHours: number, hours?: number, minutes?: number) {
    if (fillDisabled.value || zuccBusy.value) return;

    // Determine spinner key
    if (type === 'SMART WORKING' && fullDay)       zuccAction_.value = 'sw';
    else if (type === 'SMART WORKING' && !fullDay)  zuccAction_.value = 'halfsw';
    else if (type === 'FERIE' && fullDay)            zuccAction_.value = 'ferie';
    else                                             zuccAction_.value = 'halfferie';

    zuccBusy.value = true;
    zuccMsg.value  = '';

    try {
        const result = await submitZucchettiRequest({
            date:    selectedDateStr(),
            type,
            fullDay,
            hours:   hours ?? 0,
            minutes: minutes ?? 0,
        });

        if (result.success) {
            zuccMsg.value    = result.skipped ? `Già presente` : `✓ ${type}`;
            zuccMsgCls.value = result.skipped ? 'text-warning' : 'text-success';

            // Patch store with fresh day data from post-submit scrape
            if (result.dayUpdate) {
                ts.patchDay(picker.selectedDayIdx, result.dayUpdate);
            }
            if (result.scrapeError) {
                console.warn('[TsToolbar] Post-submit scrape failed:', result.scrapeError);
            }
        } else {
            zuccMsg.value    = `✗ ${result.message}`;
            zuccMsgCls.value = 'text-error';
        }

        // Fill TP hours for the selected day column regardless of Zucchetti result
        ts.fillDay(picker.selectedDayIdx, tpHours);

    } catch (err) {
        zuccMsg.value    = `✗ ${(err as Error).message}`;
        zuccMsgCls.value = 'text-error';
    } finally {
        zuccBusy.value = false;
        // Auto-clear message after 8s
        setTimeout(() => { zuccMsg.value = ''; }, 8000);
    }
}

// ---- Submit to TP ----

const submitting = ref(false);
const submitMsg  = ref('');
const submitMsgCls = ref('text-success');

const pendingEditsCount = computed(() =>
    Object.values(ts.hoursEdits).filter(h => h > 0).length
);

const submitDisabled = computed(() => pendingEditsCount.value === 0 || submitting.value);

async function runSubmit() {
    if (submitDisabled.value) return;
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
