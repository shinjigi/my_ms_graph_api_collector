<template>
    <dialog ref="dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box max-w-lg p-4">
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="close">✕</button>
            <h3 class="font-bold text-base mb-3">Invia a TargetProcess</h3>

            <!-- Empty state -->
            <div v-if="grouped.length === 0" class="text-sm text-base-content/40 italic mb-4 py-4 text-center">
                Nessuna ora da inviare.
            </div>

            <!-- Entries grouped by day -->
            <div v-else class="space-y-4 mb-4 max-h-80 overflow-y-auto pr-1">
                <div v-for="group in grouped" :key="group.dayIdx">
                    <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1.5">
                        {{ group.label }}
                    </div>
                    <div v-for="e in group.entries" :key="e.key" class="flex items-center gap-2 mb-1.5">
                        <div class="flex-1 min-w-0">
                            <div class="text-xs text-base-content/55 truncate mb-0.5">{{ e.us }}</div>
                            <input
                                type="text"
                                class="input input-xs input-bordered w-full"
                                :class="{ 'input-error': showErrors && !noteFor(e).trim() }"
                                :placeholder="`Descrizione...`"
                                :value="noteFor(e)"
                                @input="ts.setNote(e.tpId, e.dayIdx, ($event.target as HTMLInputElement).value)"
                            />
                        </div>
                        <span class="text-xs font-bold text-success shrink-0 w-8 text-right">{{ e.hours }}h</span>
                    </div>
                </div>
            </div>

            <!-- Validation warning -->
            <div v-if="showErrors && missingNotes > 0" class="text-xs text-warning mb-2">
                ⚠ {{ missingNotes }} entr{{ missingNotes > 1 ? 'ate' : 'ata' }} senza descrizione
            </div>

            <!-- Submit feedback -->
            <div v-if="submitMsg" class="text-xs mb-2" :class="submitMsgCls">{{ submitMsg }}</div>

            <!-- Actions -->
            <div class="modal-action mt-2 flex items-center">
                <button class="btn btn-xs btn-ghost text-error/60 hover:text-error mr-auto"
                        :disabled="grouped.length === 0 || submitting"
                        @click="doReset">
                    ✕ Reset
                </button>
                <button class="btn btn-sm btn-ghost" @click="close">Chiudi</button>
                <button class="btn btn-sm btn-primary gap-1 ml-1"
                        :disabled="grouped.length === 0 || submitting"
                        @click="doSubmit">
                    <span v-if="submitting" class="loading loading-spinner loading-xs"></span>
                    <span v-else>Invia ↗</span>
                    <span v-if="totalEntries > 0" class="badge badge-xs badge-primary-content ml-0.5">{{ totalEntries }}</span>
                </button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button @click="close">close</button></form>
    </dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { formatDateLabel }   from '@shared/dates';

const ts = useTimesheetStore();

const dialog = ref<HTMLDialogElement | null>(null);

interface EntryRow {
    key:    string;
    tpId:   number;
    dayIdx: number;
    us:     string;
    hours:  number;
}

interface DayGroup {
    dayIdx:  number;
    label:   string;
    entries: EntryRow[];
}

/** Builds the display rows from hoursEdits, keyed by "tpId_dayIdx". */
const grouped = computed((): DayGroup[] => {
    const allRows = [...ts.active, ...ts.pinned];
    const byDay = new Map<number, EntryRow[]>();

    for (const [key, hours] of Object.entries(ts.hoursEdits)) {
        if (!hours || hours <= 0) continue;
        const [tpIdStr, dayIdxStr] = key.split('_');
        const tpId   = Number(tpIdStr);
        const dayIdx = Number(dayIdxStr);
        if (dayIdx < 0 || dayIdx > 4) continue;

        const row = allRows.find(r => r.tpId === tpId);
        const us  = row ? `#${tpId} — ${row.us}` : `#${tpId}`;

        if (!byDay.has(dayIdx)) byDay.set(dayIdx, []);
        byDay.get(dayIdx)!.push({ key, tpId, dayIdx, us, hours });
    }

    // Sort by dayIdx, produce groups with labels
    const result: DayGroup[] = [];
    for (const dayIdx of [...byDay.keys()].sort((a, b) => a - b)) {
        const dayData = ts.weekData?.days[dayIdx];
        const label   = dayData ? formatDateLabel(dayData.date) : `Giorno ${dayIdx + 1}`;
        result.push({ dayIdx, label, entries: byDay.get(dayIdx)! });
    }
    return result;
});

const totalEntries = computed(() =>
    grouped.value.reduce((sum, g) => sum + g.entries.length, 0),
);

function noteFor(e: EntryRow): string {
    return ts.getNote(e.tpId, e.dayIdx);
}

const missingNotes = computed(() => {
    let count = 0;
    for (const g of grouped.value) {
        for (const e of g.entries) {
            if (!noteFor(e).trim()) count++;
        }
    }
    return count;
});

// --- Submit ---

const submitting   = ref(false);
const showErrors   = ref(false);
const submitMsg    = ref('');
const submitMsgCls = ref('text-success');

async function doSubmit() {
    if (grouped.value.length === 0 || submitting.value) return;
    showErrors.value = true;
    if (missingNotes.value > 0) return;

    submitting.value = true;
    submitMsg.value  = '';
    try {
        const result = await ts.submitWeekHours();
        if (result.errors.length === 0) {
            submitMsg.value    = `✓ ${result.submitted} ore inviate`;
            submitMsgCls.value = 'text-success';
            setTimeout(() => close(), 2000);
        } else {
            submitMsg.value    = `⚠ ${result.submitted} ok, ${result.errors.length} errori`;
            submitMsgCls.value = 'text-warning';
        }
    } catch (err) {
        submitMsg.value    = `✗ ${(err as Error).message}`;
        submitMsgCls.value = 'text-error';
    } finally {
        submitting.value = false;
    }
}

function doReset() {
    ts.clearEdits();
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
