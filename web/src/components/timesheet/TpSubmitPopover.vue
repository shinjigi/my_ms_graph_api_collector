<template>
    <dialog ref="dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box max-w-2xl p-4">
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="close">✕</button>
            <h3 class="font-bold text-base mb-3">Invia a TargetProcess</h3>

            <!-- Empty state -->
            <div v-if="grouped.length === 0" class="text-sm text-base-content/40 italic mb-4 py-4 text-center">
                Nessuna ora da inviare.
            </div>

            <!-- Entries grouped by day -->
            <div v-else class="space-y-4 mb-4 max-h-[70vh] overflow-y-auto pr-1">
                <div v-for="group in grouped" :key="group.dayIdx">
                    <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1.5 border-b border-base-content/5 pb-1">
                        {{ group.label }}
                    </div>
                    <div v-for="e in group.entries" :key="e.key" class="flex items-start gap-3 mb-3">
                        <div class="flex-1 min-w-0">
                            <div class="text-[11px] text-base-content/60 truncate mb-1 flex items-center gap-1.5">
                                <span class="font-bold text-base-content/80">#{{ e.tpId }}</span>
                                <span>{{ e.us }}</span>
                                <span v-if="e.status" 
                                      class="badge badge-xs"
                                      :class="e.status === 'suggested' ? 'badge-secondary opacity-70' : 'badge-ghost'">
                                    {{ e.status }}
                                </span>
                            </div>
                            <input
                                type="text"
                                class="input input-xs input-bordered w-full h-7 text-[11px]"
                                :class="{ 'input-error': showErrors && !noteFor(e).trim() }"
                                :placeholder="e.isHint && e.hintComment ? e.hintComment : 'Descrizione...'"
                                :value="noteFor(e)"
                                @input="ts.setNote(e.tpId, e.dayIdx, ($event.target as HTMLInputElement).value)"
                            />
                        </div>
                        <span class="text-xs font-bold text-success shrink-0 w-10 text-right mt-5">{{ e.hours }}h</span>
                    </div>
                </div>
            </div>

            <!-- Validation warning -->
            <div v-if="showErrors && missingNotes > 0" class="text-xs text-warning mb-2 bg-warning/10 p-2 rounded border border-warning/20">
                ⚠ {{ missingNotes }} entr{{ missingNotes > 1 ? 'ate' : 'ata' }} senza descrizione. La descrizione è obbligatoria per TP.
            </div>

            <!-- Submit feedback -->
            <div v-if="submitMsg" class="text-xs mb-2 p-2 rounded bg-base-200" :class="submitMsgCls">{{ submitMsg }}</div>

            <!-- Actions -->
            <div class="modal-action mt-2 flex items-center gap-2">
                <button class="btn btn-xs btn-ghost text-error/60 hover:text-error mr-auto"
                        :disabled="grouped.length === 0 || submitting"
                        @click="doReset">
                    ✕ Cancella bozze
                </button>
                <button class="btn btn-sm btn-ghost" @click="close">Annulla</button>
                <button class="btn btn-sm btn-primary gap-2 min-w-[120px]"
                        :disabled="grouped.length === 0 || submitting"
                        @click="doSubmit">
                    <span v-if="submitting" class="loading loading-spinner loading-xs"></span>
                    <span v-else>Invia a TP ↗</span>
                    <span v-if="totalEntries > 0" class="badge badge-xs badge-primary-content">{{ totalEntries }}</span>
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button @click="close">close</button></form>
    </dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { useAnalysisStore }  from '../../stores/useAnalysisStore';
import { formatDateLabel }   from '@shared/dates';

const ts       = useTimesheetStore();
const analysis = useAnalysisStore();

const dialog = ref<HTMLDialogElement | null>(null);

interface EntryRow {
    key:          string;
    tpId:         number;
    dayIdx:       number;
    us:           string;
    hours:        number;
    isHint:       boolean;        
    hintComment?: string;
    status?:      string;
}

interface DayGroup {
    dayIdx:  number;
    label:   string;
    entries: EntryRow[];
}

/** Group pending items by day for a cleaner UI */
const grouped = computed((): DayGroup[] => {
    const byDay = new Map<number, EntryRow[]>();

    for (const e of ts.pendingSubmissions as any[]) {
        if (!byDay.has(e.dayIdx)) byDay.set(e.dayIdx, []);
        
        byDay.get(e.dayIdx)!.push({
            key:          `${e.tpId}_${e.dayIdx}`,
            tpId:         e.tpId,
            dayIdx:       e.dayIdx,
            us:           e.usName,
            hours:        e.hours,
            isHint:       e.isHint,
            hintComment:  e.isHint ? e.description : undefined,
            status:       e.status,
        });
    }

    return [...byDay.keys()].sort((a, b) => a - b).map(dayIdx => {
        const dayData = ts.weekData?.days[dayIdx];
        return {
            dayIdx,
            label:   dayData ? formatDateLabel(dayData.date) : `Giorno ${dayIdx + 1}`,
            entries: byDay.get(dayIdx)!,
        };
    });
});

const totalEntries = computed(() => ts.pendingSubmissions.length);

function noteFor(e: EntryRow): string {
    const stored = ts.getNote(e.tpId, e.dayIdx);
    if (stored) return stored;
    if (e.isHint && e.hintComment) return e.hintComment;
    return '';
}

const missingNotes = computed(() => {
    let count = 0;
    for (const e of ts.pendingSubmissions as any[]) {
        const note = ts.getNote(e.tpId, e.dayIdx) || (e.isHint ? e.description : "");
        if (!note || !note.trim()) count++;
    }
    return count;
});

// --- Submit ---

const submitting   = ref(false);
const showErrors   = ref(false);
const submitMsg    = ref('');
const submitMsgCls = ref('text-success');

async function doSubmit() {
    if (totalEntries.value === 0 || submitting.value) return;
    showErrors.value = true;
    if (missingNotes.value > 0) return;

    submitting.value = true;
    submitMsg.value  = '';
    try {
        await ts.submitWeekHours();
        submitMsg.value    = `✓ Ore inviate con successo`;
        submitMsgCls.value = 'text-success';
        setTimeout(() => close(), 2000);
    } catch (err) {
        submitMsg.value    = `✗ ${(err as Error).message}`;
        submitMsgCls.value = 'text-error';
    } finally {
        submitting.value = false;
    }
}

function doReset() {
    ts.clearEdits();
    analysis.clearWeekHints();
    showErrors.value = false;
    submitMsg.value  = '';
    close();
}

// --- Public API ---

function open() {
    showErrors.value = false;
    submitMsg.value  = '';
    dialog.value?.showModal();
}

function close() {
    dialog.value?.close();
}

defineExpose({ open });
</script>
