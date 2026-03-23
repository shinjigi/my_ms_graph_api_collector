<template>
    <div class="overflow-x-auto" :class="{ 'we-hidden': !ui.weVisible }">
        <!-- Loading overlay -->
        <div v-if="ts.loading" class="flex items-center gap-2 py-6 justify-center text-base-content/40">
            <span class="loading loading-spinner loading-sm"></span>
            <span class="text-xs">Caricamento dati settimana…</span>
        </div>
        <template v-else>
        <!-- Main table -->
        <table class="table table-xs w-full" ref="mainTableRef" style="table-layout:fixed">
            <colgroup>
                <col style="width:auto; min-width:180px">
                <col style="width:80px">
                <col v-for="i in 5" :key="i" style="width:64px">
                <col style="width:56px">
                <col style="width:64px">
                <col style="width:40px">
            </colgroup>
            <TsHeader />
            <TsTotals />
            <!-- Active rows -->
            <tbody>
                <template v-for="(row, ri) in ts.active" :key="row.tpId">
                    <tr v-if="ri === 0 || ts.active[ri - 1].project !== row.project" class="ts-group-row">
                        <td :colspan="10"><span class="ts-group-label">{{ row.project }}</span></td>
                    </tr>
                    <TsRow :row="row" :is-pinned="false" />
                </template>
            </tbody>
            <!-- Pinned separator -->
            <tbody>
                <tr class="ts-pin-sep-row">
                    <td :colspan="10" class="px-3 py-2 border-t border-base-300">
                        <div class="flex items-center gap-2">
                            <svg class="w-3.5 h-3.5 text-warning shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/>
                            </svg>
                            <span class="text-xs font-bold text-warning/80 uppercase tracking-wide">Attività ricorrenti — da rendicontare</span>
                        </div>
                    </td>
                </tr>
            </tbody>
        </table>
        <!-- Pinned filter / sort toolbar -->
        <div class="flex items-center gap-1 px-3 py-1.5 border-t border-base-300/40 bg-base-200/30 text-base-content/35 text-xs select-none">
            <button
                class="btn btn-xs gap-1 shrink-0"
                :class="ui.pinnedFilterSignals ? 'btn-warning' : 'btn-ghost opacity-50'"
                @click="ui.pinnedFilterSignals = !ui.pinnedFilterSignals"
                title="Solo US con segnali questa settimana"
            >
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z"/>
                </svg>
                {{ pinnedSignalCount }}
            </button>
            <input
                type="text"
                placeholder="Cerca US o ID…"
                class="input input-xs flex-1 min-w-0 h-6 text-xs"
                v-model="ui.pinnedSearch"
            >
            <button v-if="ui.pinnedSearch" class="btn btn-ghost btn-xs btn-square shrink-0 opacity-50 hover:opacity-100" @click="ui.pinnedSearch = ''">✕</button>
            <button v-for="f in pinnedSortFields" :key="f.key"
                    class="hover:text-base-content/70 transition-colors px-1"
                    :class="ui.pinnedSort.field === f.key ? 'text-warning font-semibold' : ''"
                    @click="ui.sortPinned(f.key)">
                {{ f.label }}{{ pinnedSortIcon(f.key) }}
            </button>
            <span class="ml-auto shrink-0 text-base-content/25">{{ filteredPinned.length }} / {{ ts.pinned.length }}</span>
        </div>
        <!-- Pinned scroll container -->
        <div class="ts-pin-scroll">
            <table class="table table-xs w-full" style="table-layout:fixed">
                <colgroup>
                    <col v-for="(w, i) in pinWidths" :key="i" :style="{ width: w }">
                </colgroup>
                <tbody>
                    <template v-for="(row, ri) in filteredPinned" :key="row.tpId">
                        <tr v-if="ri === 0 || filteredPinned[ri - 1].project !== row.project" class="ts-group-row">
                            <td :colspan="10"><span class="ts-group-label">{{ row.project }}</span></td>
                        </tr>
                        <TsRow :row="row" :is-pinned="true" />
                    </template>
                </tbody>
            </table>
        </div>
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useTimesheetStore }  from '../../stores/useTimesheetStore';
import { useUiStore }         from '../../stores/useUiStore';
import TsRow                  from './TsRow.vue';
import TsHeader               from './TsHeader.vue';
import TsTotals               from './TsTotals.vue';
import type { QuickSortState } from '../../types';

const ts = useTimesheetStore();
const ui = useUiStore();

const STATE_ORDER: Record<string, number> = { 'Inception': 0, 'Dev/Unit test': 1, 'Testing': 2 };

const pinnedSortFields: { key: QuickSortState['field']; label: string }[] = [
    { key: 'state',    label: 'Stato' },
    { key: 'ore',      label: 'Ore' },
    { key: 'chiusura', label: 'Chiusura' },
];

function pinnedSortIcon(f: string) {
    if (ui.pinnedSort.field !== f) return '';
    return ui.pinnedSort.dir === 1 ? ' ↑' : ' ↓';
}

const pinnedSignalCount = computed(() =>
    ts.pinned.filter(r => (r.git ?? []).some(c => c > 0)).length
);

const filteredPinned = computed(() => {
    let items = [...ts.pinned];
    if (ui.pinnedFilterSignals) items = items.filter(r => (r.git ?? []).some(c => c > 0));
    const needle = ui.pinnedSearch.trim().toLowerCase();
    if (needle) items = items.filter(r => r.us.toLowerCase().includes(needle) || String(r.tpId).includes(needle));
    return items.sort((a, b) => {
        let va: number, vb: number;
        switch (ui.pinnedSort.field) {
            case 'state':    va = STATE_ORDER[a.state] ?? 99; vb = STATE_ORDER[b.state] ?? 99; break;
            case 'ore':      va = a.totAllTime ?? 0;          vb = b.totAllTime ?? 0;          break;
            case 'chiusura': va = a.rem != null ? a.rem : 999; vb = b.rem != null ? b.rem : 999; break;
            default:         va = vb = 0;
        }
        return (va === vb ? 0 : va < vb ? -1 : 1) * ui.pinnedSort.dir;
    });
});

// Sync pinned table column widths from the main table header
const mainTableRef = ref<HTMLTableElement | null>(null);
const pinWidths    = ref<string[]>([]);

function syncPinCols() {
    const ths = mainTableRef.value?.querySelectorAll('thead th');
    if (!ths) return;
    pinWidths.value = Array.from(ths).map(th => (th as HTMLElement).offsetWidth + 'px');
}

const ro = new ResizeObserver(() => syncPinCols());

onMounted(() => {
    nextTick(syncPinCols);
    if (mainTableRef.value) ro.observe(mainTableRef.value);
});
onUnmounted(() => ro.disconnect());

// Re-sync when data changes (active rows may change column distribution)
watch(() => ts.active.length + ts.pinned.length, () => nextTick(syncPinCols));
</script>
