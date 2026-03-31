<template>
    <dialog ref="dialog" class="modal modal-bottom sm:modal-middle">
        <div class="modal-box max-w-sm p-4">
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="close">✕</button>

            <!-- Header: day label -->
            <h3 class="font-bold text-base mb-3">{{ dateLabel }}</h3>

            <!-- Location section -->
            <div class="mb-3 space-y-1">
                <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">Posizione</div>
                <div class="flex items-center gap-2 text-sm">
                    <span class="text-lg">{{ locationEmoji(dayData?.location) }}</span>
                    <span>{{ locationTitle(dayData?.location) }}</span>
                </div>
                <div class="text-xs text-base-content/40">
                    <span v-if="dayData?.nibol">
                        Nibol: <span class="font-medium text-base-content/60">{{ nibolLabel }}</span>
                    </span>
                    <span v-else class="italic">Nessuna prenotazione Nibol</span>
                </div>
            </div>

            <!-- Zucchetti giustificativi -->
            <div v-if="giust.length > 0" class="mb-3">
                <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">Giustificativi Zucchetti</div>
                <div class="flex flex-wrap gap-1">
                    <span v-for="g in giust" :key="g.text"
                          class="badge badge-sm badge-ghost text-xs">{{ g.text }}</span>
                </div>
            </div>

            <!-- Signals summary -->
            <div v-if="signals.total > 0" class="mb-3">
                <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1">Segnali di lavoro</div>
                <div class="flex flex-wrap gap-2 text-xs text-base-content/60">
                    <span v-if="signals.meetings > 0">📅 {{ signals.meetings }} riunioni</span>
                    <span v-if="signals.emails > 0">✉️ {{ signals.emails }} email</span>
                    <span v-if="signals.commits > 0">💾 {{ signals.commits }} commit</span>
                    <span v-if="signals.teams > 0">💬 {{ signals.teams }} Teams</span>
                </div>
            </div>
            <div v-else class="mb-3 text-xs text-base-content/30 italic">Nessun segnale di lavoro rilevato</div>

            <!-- Declarations (moved from TsZucchettiBar) -->
            <div class="mb-3">
                <div class="text-xs font-semibold text-base-content/50 uppercase tracking-wide mb-1.5">Dichiara su Zucchetti</div>
                <div class="flex flex-wrap gap-1.5">
                    <button class="btn btn-xs btn-outline gap-1" :disabled="busy" @click="doAction('SMART WORKING', true, WORKDAY_HOURS)">
                        🏠 SW giornata
                    </button>
                    <button class="btn btn-xs btn-outline gap-1" :disabled="busy" @click="doAction('SMART WORKING', false, HALF_WORKDAY_HOURS, 3, 51)">
                        🏠 SW mezza
                    </button>
                    <button class="btn btn-xs btn-outline gap-1 text-warning border-warning/50" :disabled="busy" @click="doAction('FERIE', true, 0)">
                        🏖️ Ferie giornata
                    </button>
                    <button class="btn btn-xs btn-outline gap-1 text-warning border-warning/50" :disabled="busy" @click="doAction('FERIE', false, HALF_WORKDAY_HOURS, 3, 51)">
                        🏖️ Ferie mezza
                    </button>
                </div>
            </div>

            <!-- Action feedback -->
            <div v-if="actionMsg" class="text-xs mb-2" :class="actionMsgCls">{{ actionMsg }}</div>

            <!-- Modal actions: Sync + Close -->
            <div class="modal-action mt-2">
                <button class="btn btn-sm btn-outline gap-1" :disabled="syncing || busy" @click="doSync(false)">
                    <span v-if="syncing" class="loading loading-spinner loading-xs"></span>
                    <span v-else>🔄</span>
                    Sincronizza giorno
                </button>
                <button class="btn btn-sm btn-ghost" @click="close">Chiudi</button>
            </div>

            <!-- Sync feedback -->
            <div v-if="syncMsg" class="text-xs mt-2" :class="syncMsgCls">{{ syncMsg }}</div>
        </div>
        <form method="dialog" class="modal-backdrop"><button @click="close">close</button></form>
    </dialog>
</template>

<script setup lang="ts">
import { ref, computed }             from 'vue';
import { useTimesheetStore }          from '../../stores/useTimesheetStore';
import { usePickerStore }             from '../../stores/usePickerStore';
import { syncData }                   from '../../api';
import { submitZucchettiRequest }     from '../../api';
import { locationEmoji, locationTitle } from '../../utils';
import { WORKDAY_HOURS, HALF_WORKDAY_HOURS, DAYABB_IT, MONTH_IT } from '../../standards';
import type { WeekDayResponse }       from '../../types';
import type { ZucchettiJustification } from '@shared/zucchetti';

const ts     = useTimesheetStore();
const picker = usePickerStore();

const dialog  = ref<HTMLDialogElement | null>(null);
const dayIdx  = ref(0);

// --- Derived data ---

const dayData = computed(() => ts.weekData?.days[dayIdx.value] ?? null);

const dateLabel = computed(() => {
    const d = dayData.value;
    if (!d) return '–';
    const parts = d.date.split('-');
    const dt    = new Date(+parts[0], +parts[1] - 1, +parts[2]);
    const dow   = DAYABB_IT[dt.getDay()];
    const mon   = MONTH_IT[dt.getMonth()];
    return `${dow} ${dt.getDate()} ${mon}`;
});

const nibolLabel = computed(() => {
    const n = dayData.value?.nibol;
    if (!n) return null;
    const t = n.type.toLowerCase();
    return t === 'remote' || t === 'home' ? '🏠 Smart working' : '🏢 In ufficio';
});

const giust = computed((): ZucchettiJustification[] =>
    dayData.value?.zucchetti?.giustificativi ?? [],
);

const signals = computed(() => {
    const d = dayData.value;
    if (!d) return { meetings: 0, emails: 0, commits: 0, teams: 0, total: 0 };
    const meetings = d.calendar?.length ?? 0;
    const emails   = d.emails?.length   ?? 0;
    const commits  = (d.gitCommits?.length ?? 0) + (d.svnCommits?.length ?? 0);
    const teams    = d.teams?.length    ?? 0;
    return { meetings, emails, commits, teams, total: meetings + emails + commits + teams };
});

// --- Sync ---

const syncing    = ref(false);
const syncMsg    = ref('');
const syncMsgCls = ref('text-success');

async function doSync(force: boolean) {
    if (syncing.value) return;
    syncing.value = true;
    syncMsg.value = '';

    try {
        const d      = dayData.value;
        if (!d) throw new Error('Giorno non selezionato');
        const result = await syncData('day', d.date, force);

        const aggregated = result.aggregated.length;
        const errors     = result.errors.length;
        if (errors > 0) {
            syncMsg.value    = `⚠ ${aggregated} aggregati, ${errors} errori`;
            syncMsgCls.value = 'text-warning';
        } else {
            syncMsg.value    = `✓ Sincronizzato (${result.synced.join(', ') || 'già aggiornato'})`;
            syncMsgCls.value = 'text-success';
        }

        // Re-fetch week data so the UI reflects fresh location info
        await ts.fetchWeekData(d.date);
    } catch (err) {
        syncMsg.value    = `✗ ${(err as Error).message}`;
        syncMsgCls.value = 'text-error';
    } finally {
        syncing.value = false;
        setTimeout(() => { syncMsg.value = ''; }, 10000);
    }
}

// --- Zucchetti declarations (absorbed from TsZucchettiBar) ---

const busy        = ref(false);
const actionMsg   = ref('');
const actionMsgCls = ref('text-success');

function selectedDateStr(): string {
    const d = dayData.value;
    if (!d) return '';
    return d.date;
}

async function doAction(type: string, fullDay: boolean, tpHours: number, hours?: number, minutes?: number) {
    if (busy.value) return;
    busy.value   = true;
    actionMsg.value = '';

    try {
        const result = await submitZucchettiRequest({
            date:    selectedDateStr(),
            type,
            fullDay,
            hours:   hours ?? 0,
            minutes: minutes ?? 0,
        });

        if (result.success) {
            actionMsg.value    = result.skipped ? 'Già presente' : `✓ ${type}`;
            actionMsgCls.value = result.skipped ? 'text-warning' : 'text-success';

            if (result.dayUpdate) {
                ts.patchDay(dayIdx.value, result.dayUpdate as unknown as WeekDayResponse);
            }
        } else {
            actionMsg.value    = `✗ ${result.message}`;
            actionMsgCls.value = 'text-error';
        }

        ts.fillDay(dayIdx.value, tpHours);
    } catch (err) {
        actionMsg.value    = `✗ ${(err as Error).message}`;
        actionMsgCls.value = 'text-error';
    } finally {
        busy.value = false;
        setTimeout(() => { actionMsg.value = ''; }, 8000);
    }
}

// --- Public API ---

function open(idx: number) {
    dayIdx.value = idx;
    syncMsg.value = '';
    actionMsg.value = '';
    dialog.value?.showModal();
}

function close() {
    dialog.value?.close();
}

defineExpose({ open });
</script>
