<template>
    <div class="card bg-base-100 border border-base-300 shadow-sm overflow-y-auto" style="max-height:660px;">
        <div class="card-body p-3">
            <div class="flex items-center justify-between mb-2">
                <div class="text-xs font-bold text-base-content/50 uppercase">Lavoro · TP</div>
                <div class="flex items-center gap-2">
                    <span v-if="submitMsg" class="text-xs" :class="submitMsgCls">{{ submitMsg }}</span>
                    <button
                        class="btn btn-xs btn-outline btn-primary gap-1"
                        :disabled="pendingDayEdits === 0 || submitting"
                        :title="pendingDayEdits === 0 ? 'Nessuna modifica da inviare' : 'Invia ore a TargetProcess'"
                        @click="runDaySubmit"
                    >
                        <span v-if="submitting" class="loading loading-spinner loading-xs"></span>
                        <span v-else>Invia a TP</span>
                        <span v-if="pendingDayEdits > 0" class="badge badge-xs badge-primary">{{ pendingDayEdits }}</span>
                    </button>
                </div>
            </div>

            <!-- US cards -->
            <div
                v-for="us in day.usToday"
                :key="us.tpId"
                class="us-card py-2 px-3"
                :class="{ highlight: highlightedUs === us.us }"
            >
                <div class="flex items-center gap-2 mb-1.5">
                    <span class="state-dot shrink-0" :style="{ background: stateColor(us.state) }"></span>
                    <a :href="tpLink(us.tpId)" target="_blank"
                       class="text-sm font-semibold hover:underline flex-1 truncate"
                       :style="{ color: us.color }">{{ us.us }}</a>
                    <span class="text-xs text-base-content/35 shrink-0 whitespace-nowrap">{{ us.state }}</span>
                </div>
                <!-- Progress bars -->
                <div class="grid grid-cols-2 gap-1.5 mb-1.5 text-xs">
                    <div>
                        <div class="flex justify-between mb-0.5">
                            <span class="text-base-content/40">TP</span>
                            <span class="font-bold text-primary">{{ us.tpHours }}h</span>
                        </div>
                        <div class="hours-bar-bg">
                            <div class="hours-bar-tp" :style="{ width: tpPct(us) + '%' }"></div>
                        </div>
                    </div>
                    <div>
                        <div class="flex justify-between mb-0.5">
                            <span class="text-base-content/40">Zuc</span>
                            <span class="font-bold text-success">{{ us.zucHours }}h</span>
                        </div>
                        <div class="hours-bar-bg">
                            <div class="hours-bar-zuc" style="width:100%"></div>
                        </div>
                    </div>
                </div>
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-xs text-base-content/40 font-medium shrink-0">TP:</span>
                    <template v-if="cardCellMode(us.tpId) === 'hint-only'">
                        <button class="ai-hint-btn"
                                :class="`confidence-${cardHint(us.tpId)!.confidence}`"
                                @click="acceptCardHint(us.tpId)"
                                :title="`AI (${cardHint(us.tpId)!.confidence}): ${cardHint(us.tpId)!.inferredHours}h`">
                            <span class="ai-hint-val">{{ cardHint(us.tpId)!.inferredHours }}h</span>
                            <span class="ai-hint-dot"></span>
                        </button>
                    </template>
                    <template v-else>
                        <TimeCellWidget
                            :model-value="us.tpHours"
                            :hint-val="cardHint(us.tpId)?.inferredHours"
                            :cell-mode="cardCellMode(us.tpId)"
                            @update="val => {
                                day.setTpHours(us.tpId, val);
                                if (val === 0) day.setUsNote(us.tpId, '');
                                else if (cardHint(us.tpId)?.comment)
                                    day.setUsNote(us.tpId, cardHint(us.tpId)!.comment!);
                            }"
                        />
                    </template>
                    <span v-if="us.emails"   class="us-signal"><span class="commit-dot source-mail" style="width:5px;height:5px"></span>{{ us.emails }} email</span>
                    <span v-if="us.commits"  class="us-signal"><span class="commit-dot source-git"  style="width:5px;height:5px"></span>{{ us.commits }} commit</span>
                    <span v-if="us.meetings" class="us-signal">📅 {{ us.meetings }} meeting</span>
                    <a :href="tpLink(us.tpId)" target="_blank" class="us-signal text-primary hover:underline ml-auto shrink-0">→ TP #{{ us.tpId }}</a>
                </div>
                <!-- Note -->
                <NoteEdit
                    class="mt-1.5 pt-1.5 border-t border-base-300/50 text-xs text-base-content/55"
                    :value="us.note"
                    @update="val => day.setUsNote(us.tpId, val)"
                />
            </div>

            <!-- Quick log -->
            <div class="divider text-xs text-base-content/30 my-2">
                Log rapido · {{ filteredQuickLog.length }}<template v-if="isFiltered"> (filtrato)</template> / {{ day.quickLog.length }} US
            </div>
            <div class="flex items-center gap-1 px-1 pb-1 text-base-content/35 text-xs select-none border-b border-base-300/40 mb-1">
                <button
                    class="btn btn-xs gap-1 shrink-0"
                    :class="ui.quickFilterSignals ? 'btn-primary' : 'btn-ghost opacity-50'"
                    @click="ui.quickFilterSignals = !ui.quickFilterSignals"
                    title="Solo US con segnali oggi"
                >
                    <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
                    </svg>
                    {{ signalCount }}
                </button>
                <input
                    type="text"
                    placeholder="Cerca US o ID…"
                    class="input input-xs flex-1 min-w-0 h-6 text-xs"
                    v-model="ui.quickSearch"
                >
                <button v-if="ui.quickSearch" class="btn btn-ghost btn-xs btn-square shrink-0 opacity-50 hover:opacity-100" @click="ui.quickSearch = ''">✕</button>
                <button v-for="f in sortFields" :key="f.key"
                        class="hover:text-base-content/70 transition-colors px-1"
                        :class="ui.quickSort.field === f.key ? 'text-primary font-semibold' : ''"
                        @click="ui.sortQuick(f.key)">
                    {{ f.label }}{{ sortIcon(f.key) }}
                </button>
            </div>

            <div class="space-y-0.5">
                <div
                    v-for="r in filteredQuickLog"
                    :key="r.tpId"
                    class="flex items-center gap-2 py-1 px-2 rounded-lg hover:bg-base-200/60 transition-colors group"
                    :class="r.commits > 0 ? '' : 'opacity-60'"
                >
                    <span class="state-dot shrink-0" :style="{ background: stateColor(r.state) }"></span>
                    <a :href="tpLink(r.tpId)" target="_blank"
                       class="text-xs flex-1 truncate hover:underline hover:text-primary transition-colors"
                       :class="r.commits > 0 ? 'text-base-content/80' : 'text-base-content/50'"
                       :title="r.us">{{ r.us }}</a>
                    <span v-if="r.commits > 0" class="text-xs shrink-0" style="color:#6366f1aa">💻{{ r.commits }}</span>
                    <span class="text-base-content/25 text-xs shrink-0 tabular-nums">{{ r.totAllTime ?? '' }}h</span>
                    <button
                        class="btn btn-ghost btn-xs btn-square text-base-content/35 hover:text-primary hover:bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity"
                        @click="day.addToWorkToday(r.tpId)"
                        title="Aggiungi a Lavoro TP"
                    >
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 4v16m8-8H4"/>
                        </svg>
                    </button>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed }       from 'vue';
import { useDayStore }         from '../../stores/useDayStore';
import { useUiStore }          from '../../stores/useUiStore';
import { useTimesheetStore }   from '../../stores/useTimesheetStore';
import { usePickerStore }      from '../../stores/usePickerStore';
import { useAnalysisStore }    from '../../stores/useAnalysisStore';
import { stateColor, tpLink } from '../../utils';
import { shiftDate }        from '@shared/dates';
import TimeCellWidget          from '../TimeCellWidget.vue';
import NoteEdit                from './NoteEdit.vue';
import type { UsCard, QuickSortState, CellMode } from '../../types';

defineProps<{ highlightedUs?: string }>();

const day      = useDayStore();
const ui       = useUiStore();
const ts       = useTimesheetStore();
const picker   = usePickerStore();
const analysis = useAnalysisStore();

function cardHint(tpId: number) {
    const monday = ts.currentMonday;
    const i      = picker.selectedDayIdx;
    if (!monday || i < 0) return null;
    return analysis.getHint(tpId, i, monday);
}

function cardCellMode(tpId: number): CellMode {
    const monday = ts.currentMonday;
    const i      = picker.selectedDayIdx;
    if (!monday || i < 0) return 'clean';
    const hint    = analysis.getHint(tpId, i, monday);
    const key     = `${tpId}_${i}`;
    const hasEdit = key in ts.hoursEdits;
    const hours   = ts.getHours(tpId, i);

    // If day is balanced, hide pulsating hints (hint-only) for tasks without hours
    if (Math.abs(day.dayTotals.delta) < 0.05 && (!hasEdit || hours === 0))
        return 'clean';

    if (!hint || hint.inferredHours <= 0)
        return hasEdit && hours > 0 ? 'user-edit' : 'clean';
    if (!hasEdit || hours === 0) return 'hint-only';
    if (+hours.toFixed(1) === +hint.inferredHours.toFixed(1)) return 'hint-match';
    return 'hint-differ';
}

function acceptCardHint(tpId: number) {
    const i    = picker.selectedDayIdx;
    const hint = cardHint(tpId);
    if (!hint || i < 0 || !ts.currentMonday) return;
    ts.setHours(tpId, i, hint.inferredHours);
    if (hint.comment)
        ts.setNote(tpId, i, hint.comment);

    // Persist to server
    const dateStr = shiftDate(ts.currentMonday, i);
    analysis.setEntryStatus(dateStr, tpId, 'applied');
}

const submitting   = ref(false);
const submitMsg    = ref('');
const submitMsgCls = ref('text-success');

const pendingDayEdits = computed(() => {
    const dayIdx = picker.selectedDayIdx;
    if (dayIdx < 0) return 0;
    return Object.entries(ts.hoursEdits)
        .filter(([key, h]) => h > 0 && key.endsWith(`_${dayIdx}`))
        .length;
});

async function runDaySubmit() {
    if (pendingDayEdits.value === 0 || submitting.value) return;
    submitting.value = true;
    submitMsg.value  = '';
    try {
        const result = await ts.submitDayHours(picker.selectedDayIdx);
        if (result.errors.length === 0) {
            submitMsg.value    = `✓ ${result.submitted} ore inviate`;
            submitMsgCls.value = 'text-success';
        } else {
            submitMsg.value    = `⚠ ${result.submitted} ok, ${result.errors.length} err`;
            submitMsgCls.value = 'text-warning';
        }
        setTimeout(() => { submitMsg.value = ''; }, 6000);
    } catch (err) {
        submitMsg.value    = `✗ ${(err as Error).message}`;
        submitMsgCls.value = 'text-error';
    } finally {
        submitting.value = false;
    }
}

const STATE_ORDER: Record<string, number> = { 'Inception': 0, 'Dev/Unit test': 1, 'Testing': 2 };

const tpPct  = (us: UsCard) => us.zucHours > 0 ? Math.min(100, Math.round(us.tpHours / us.zucHours * 100)) : 0;

const signalCount = computed(() => day.quickLog.filter(r => r.commits > 0).length);
const isFiltered  = computed(() => ui.quickFilterSignals || !!ui.quickSearch);

const sortFields: { key: QuickSortState['field']; label: string }[] = [
    { key:'state', label:'Stato' },
    { key:'ore',   label:'Ore' },
    { key:'chiusura', label:'Chiusura' },
];

function sortIcon(f: string) {
    if (ui.quickSort.field !== f) return '';
    return ui.quickSort.dir === 1 ? ' ↑' : ' ↓';
}

const filteredQuickLog = computed(() => {
    let items = [...day.quickLog];
    if (ui.quickFilterSignals) items = items.filter(r => r.commits > 0);
    const needle = ui.quickSearch.trim().toLowerCase();
    if (needle) items = items.filter(r => r.us.toLowerCase().includes(needle) || String(r.tpId).includes(needle));
    return items.sort((a, b) => {
        let va: number, vb: number;
        switch (ui.quickSort.field) {
            case 'state':    va = STATE_ORDER[a.state] ?? 99; vb = STATE_ORDER[b.state] ?? 99; break;
            case 'ore':      va = a.totAllTime ?? 0; vb = b.totAllTime ?? 0; break;
            case 'chiusura': va = a.rem != null ? a.rem : 999; vb = b.rem != null ? b.rem : 999; break;
            default:         va = vb = 0;
        }
        return (va === vb ? 0 : va < vb ? -1 : 1) * ui.quickSort.dir;
    });
});
</script>

<style scoped>
.hours-bar-bg { background-color: oklch(var(--b2)); height:4px; border-radius:2px; overflow:hidden; }
.hours-bar-tp { background-color: oklch(var(--p)); height:100%; border-radius:2px; }
.hours-bar-zuc { background-color: oklch(var(--su) / 0.5); height:100%; border-radius:2px; }

.us-card { border-bottom: 1px solid oklch(var(--b3)); transition: background 0.2s; }
.us-card:last-child { border-bottom: none; }
.us-card.highlight { background: oklch(var(--p) / 0.05); }

.state-dot { width: 6px; height: 6px; border-radius: 50%; display: inline-block; }
.us-signal {
    background: oklch(var(--b2)); padding: 1px 6px; border-radius: 99px;
    font-size: 0.65rem; color: oklch(var(--bc) / 0.5); display: flex; align-items: center; gap: 4px; border: 1px solid oklch(var(--b3));
}

@keyframes ai-pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--ai-color); }
    50%       { box-shadow: 0 0 0 3px var(--ai-color); }
}
@keyframes ai-dot-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.2; }
}

.ai-hint-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    background: transparent;
    border: 1px solid;
    transition: background 0.15s;
    --ai-color: oklch(var(--wa) / 0.45);
    color: oklch(var(--wa));
    border-color: oklch(var(--wa) / 0.5);
    animation: ai-pulse 2s ease-in-out infinite;
}
.ai-hint-btn.confidence-high {
    --ai-color: oklch(var(--su) / 0.45);
    color: oklch(var(--su));
    border-color: oklch(var(--su) / 0.5);
}
.ai-hint-btn.confidence-low {
    --ai-color: oklch(var(--er) / 0.3);
    color: oklch(var(--er) / 0.7);
    border-color: oklch(var(--er) / 0.35);
}
.ai-hint-btn:hover { background: oklch(var(--b3)); }
.ai-hint-dot {
    width: 4px; height: 4px;
    border-radius: 50%;
    background: currentColor;
    animation: ai-dot-blink 1.4s ease-in-out infinite;
}
.ai-hint-val { line-height: 1; }
</style>
