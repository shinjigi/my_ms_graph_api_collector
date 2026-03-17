<template>
    <div class="card bg-base-100 border border-base-300 shadow-sm overflow-y-auto" style="max-height:660px;">
        <div class="card-body p-3">
            <div class="flex items-center justify-between mb-2">
                <div class="text-xs font-bold text-base-content/50 uppercase">Lavoro · TP</div>
                <div class="text-xs text-base-content/30 italic">correlazione da subject</div>
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
                    <TimeCellWidget :model-value="us.tpHours" @update="val => day.setTpHours(us.tpId, val)" />
                    <span v-if="us.emails"   class="us-signal"><span class="commit-dot source-mail" style="width:5px;height:5px"></span>{{ us.emails }} email</span>
                    <span v-if="us.commits"  class="us-signal"><span class="commit-dot source-git"  style="width:5px;height:5px"></span>{{ us.commits }} commit</span>
                    <span v-if="us.meetings" class="us-signal">📅 {{ us.meetings }} meeting</span>
                    <a :href="tpLink(us.tpId)" target="_blank" class="us-signal text-primary hover:underline ml-auto shrink-0">→ TP #{{ us.tpId }}</a>
                </div>
                <!-- Note -->
                <NoteEdit
                    class="mt-1.5 pt-1.5 border-t border-base-300/50 text-xs text-base-content/55"
                    :value="day.usNotes[us.tpId] ?? us.note"
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
                    <span class="text-base-content/25 text-xs shrink-0 tabular-nums">{{ (r as any).totAllTime ?? '' }}h</span>
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
import { computed }       from 'vue';
import { useDayStore }    from '../../stores/useDayStore';
import { useUiStore }     from '../../stores/useUiStore';
import TimeCellWidget     from './TimeCellWidget.vue';
import NoteEdit           from './NoteEdit.vue';
import type { UsCard, QuickSortState } from '../../types';

defineProps<{ highlightedUs?: string }>();

const day = useDayStore();
const ui  = useUiStore();

const STATE_ORDER: Record<string, number> = { 'Inception': 0, 'Dev/Unit test': 1, 'Testing': 2 };

const stateColor = (s: string) =>
    ({ 'Inception':'#94a3b8', 'Dev/Unit test':'#6366f1', 'Testing':'#f59e0b' }[s] ?? '#94a3b8');

const tpLink = (id: number) => `https://euroconsumers.tpondemand.com/entity/${id}`;
const tpPct  = (us: UsCard) => us.zucHours > 0 ? Math.min(100, Math.round(us.tpHours / us.zucHours * 100)) : 0;

const signalCount = computed(() => day.quickLog.filter((r: any) => r.commits > 0).length);
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
    let items = [...day.quickLog] as (UsCard & { totAllTime?: number; rem?: number })[];
    if (ui.quickFilterSignals) items = items.filter(r => r.commits > 0);
    const needle = ui.quickSearch.trim().toLowerCase();
    if (needle) items = items.filter(r => r.us.toLowerCase().includes(needle) || String(r.tpId).includes(needle));
    return items.sort((a, b) => {
        let va: number, vb: number;
        switch (ui.quickSort.field) {
            case 'state':    va = STATE_ORDER[a.state] ?? 99; vb = STATE_ORDER[b.state] ?? 99; break;
            case 'ore':      va = (a as any).totAllTime ?? 0; vb = (b as any).totAllTime ?? 0; break;
            case 'chiusura': va = (a as any).rem != null ? (a as any).rem : 999; vb = (b as any).rem != null ? (b as any).rem : 999; break;
            default:         va = vb = 0;
        }
        return (va === vb ? 0 : va < vb ? -1 : 1) * ui.quickSort.dir;
    });
});
</script>
