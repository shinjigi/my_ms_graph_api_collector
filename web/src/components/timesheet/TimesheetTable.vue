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
        <!-- Pinned scroll container -->
        <div class="ts-pin-scroll">
            <table class="table table-xs w-full" style="table-layout:fixed">
                <colgroup>
                    <col v-for="(w, i) in pinWidths" :key="i" :style="{ width: w }">
                </colgroup>
                <tbody>
                    <template v-for="(row, ri) in ts.pinned" :key="row.tpId">
                        <tr v-if="ri === 0 || ts.pinned[ri - 1].project !== row.project" class="ts-group-row">
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
import { ref, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useTimesheetStore }  from '../../stores/useTimesheetStore';
import { useUiStore }         from '../../stores/useUiStore';
import TsRow                  from './TsRow.vue';
import TsHeader               from './TsHeader.vue';
import TsTotals               from './TsTotals.vue';

const ts = useTimesheetStore();
const ui = useUiStore();

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
