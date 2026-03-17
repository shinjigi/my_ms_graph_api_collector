<template>
    <div class="overflow-x-auto" :class="{ 'we-hidden': !ui.weVisible }">
        <!-- Main table -->
        <table class="table table-xs w-full" ref="mainTableRef" style="table-layout:fixed;">
            <colgroup>
                <col style="width:auto; min-width:240px">
                <col style="width:80px">
                <col v-for="(d, i) in ts.days" :key="i" v-bind="colAttrs(d, i)" :style="colStyle(d, i)">
                <col style="width:64px">
                <col style="width:40px">
            </colgroup>
            <thead>
                <tr class="text-xs">
                    <th class="w-48">User Story</th>
                    <th class="w-20">Stato</th>
                    <th v-for="(d, i) in ts.days.slice(0, 6)" :key="i"
                        class="text-center text-xs"
                        :class="dayHeadCls(d, i)">
                        <template v-if="i === 5">
                            <span class="flex flex-col items-center opacity-55">
                                <span class="font-bold">WE</span>
                                <span class="font-normal" style="font-size:.6rem">Sab · Dom</span>
                            </span>
                        </template>
                        <template v-else-if="d.holiday">
                            <span class="flex flex-col items-center gap-0.5 opacity-80">
                                <span>{{ d.label }}</span>
                                <span class="font-normal text-xs">{{ d.date }}</span>
                                <span style="font-size:.6rem;color:hsl(280 60% 75%)" :title="d.holidayName">🇮🇹 Festività</span>
                            </span>
                        </template>
                        <template v-else>
                            <span class="day-header-cell flex flex-col items-center gap-0.5"
                                  @click="selectTsDay(i)">
                                <span :class="i === 4 ? 'text-primary font-bold' : ''">{{ d.label }}</span>
                                <span class="font-normal opacity-60 text-xs">{{ d.date }}</span>
                                <span class="text-xs font-bold" :class="rendIconCls(d.rend)">{{ rendIcon(d.rend) }}</span>
                            </span>
                        </template>
                    </th>
                    <th class="text-center w-16 text-xs">Tot</th>
                    <th class="text-center w-10 text-xs opacity-60">Rem</th>
                </tr>
            </thead>
            <!-- Totals -->
            <tbody>
                <tr class="text-xs" style="background:hsl(var(--b2)/0.55)">
                    <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Ore TP</td>
                    <td v-for="(d, i) in ts.days.slice(0, 6)" :key="i" class="text-center text-xs font-bold" :class="totalsCellCls(d, i, 'tp')">
                        {{ d.holiday || i === 5 ? (i === 5 ? '—' : '🇮🇹') : (ts.totalsRow.tp[i] || '—') }}
                    </td>
                    <td class="text-center font-bold text-primary text-xs">{{ tpWeekTotal }}</td>
                    <td></td>
                </tr>
                <tr class="text-xs" style="background:hsl(var(--b2)/0.55)">
                    <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Zucchetti</td>
                    <td v-for="(d, i) in ts.days.slice(0, 6)" :key="i" class="text-center text-xs font-bold" :class="totalsCellCls(d, i, 'zuc')">
                        <template v-if="d.holiday">🇮🇹</template>
                        <template v-else-if="i === 5">—</template>
                        <template v-else-if="d.zucHours > 0"><span class="text-success">{{ d.zucHours }}</span></template>
                        <template v-else><span class="err-x font-black text-sm">✗</span></template>
                    </td>
                    <td class="text-center font-bold text-success text-xs">{{ zucWeekTotal }}</td>
                    <td></td>
                </tr>
                <tr class="text-xs border-b-2 border-base-300" style="background:hsl(var(--b2)/0.55)">
                    <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Delta</td>
                    <td v-for="(d, i) in ts.days.slice(0, 6)" :key="i" class="text-center text-xs" :class="totalsCellCls(d, i, 'delta')">
                        <template v-if="d.holiday || i === 5">—</template>
                        <template v-else>
                            <span :class="ts.totalsRow.delta[i] === 0 ? 'text-success font-black' : ts.totalsRow.delta[i] > 0 ? 'text-error' : 'text-base-content/40'">
                                {{ ts.totalsRow.delta[i] === 0 ? '✓' : ts.totalsRow.delta[i] > 0 ? `−${ts.totalsRow.delta[i]}h` : '—' }}
                            </span>
                        </template>
                    </td>
                    <td class="text-center font-bold text-error text-xs">{{ deltaWeekTotal }}</td>
                    <td></td>
                </tr>
            </tbody>
            <!-- Active rows -->
            <tbody>
                <template v-for="(row, ri) in ts.active" :key="row.tpId">
                    <tr v-if="ri === 0 || ts.active[ri - 1].project !== row.project" class="ts-group-row">
                        <td :colspan="11"><span class="ts-group-label">{{ row.project }}</span></td>
                    </tr>
                    <TsRow :row="row" :is-pinned="false" />
                </template>
            </tbody>
            <!-- Pinned separator -->
            <tbody>
                <tr class="ts-pin-sep-row">
                    <td :colspan="11" class="px-3 py-2">
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
            <table class="table table-xs w-full" style="table-layout:fixed;" :style="pinColStyles">
                <colgroup ref="pinColgroupRef">
                    <col v-for="(w, i) in pinWidths" :key="i" :style="{ width: w }">
                </colgroup>
                <tbody>
                    <template v-for="(row, ri) in ts.pinned" :key="row.tpId">
                        <tr v-if="ri === 0 || ts.pinned[ri - 1].project !== row.project" class="ts-group-row">
                            <td :colspan="11"><span class="ts-group-label">{{ row.project }}</span></td>
                        </tr>
                        <TsRow :row="row" :is-pinned="true" />
                    </template>
                </tbody>
            </table>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useTimesheetStore }  from '../../stores/useTimesheetStore';
import { usePickerStore }     from '../../stores/usePickerStore';
import { useUiStore }         from '../../stores/useUiStore';
import TsRow                  from './TsRow.vue';
import type { Day }           from '../../types';

const ts     = useTimesheetStore();
const picker = usePickerStore();
const ui     = useUiStore();

// Dates of Mon–Sat for the week containing pickerSelected
const weekDates = computed<Date[]>(() => {
    const sel = picker.pickerSelected;
    const dow = sel.getDay();
    const monday = new Date(sel);
    monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        return d;
    });
});

function selectTsDay(i: number) {
    const date = weekDates.value[i];
    if (!date) return;
    picker.selectDay(date.getFullYear(), date.getMonth(), date.getDate());
    ui.setView('dashboard');
}

const mainTableRef  = ref<HTMLTableElement | null>(null);
const pinWidths     = ref<string[]>([]);

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

const pinColStyles = computed(() => ({ tableLayout: 'fixed' as const }));

const rendIcon    = (r: Day['rend']) => r === 'ok' ? '✓' : r === 'warn' ? '⚠' : r === 'err' ? '✗' : '';
const rendIconCls = (r: Day['rend']) => r === 'ok' ? 'text-success' : r === 'warn' ? 'text-warning' : r === 'err' ? 'text-error opacity-80' : 'opacity-0';

function dayHeadCls(d: Day, i: number): string[] {
    const cls: string[] = [];
    if (i === 5) { cls.push('weekend-col', 'we-col'); return cls; }
    if (d.holiday) { cls.push('holiday-col'); return cls; }
    if (i === 4) cls.push('today-col');
    if (d.rend === 'ok')   cls.push('day-ok');
    if (d.rend === 'warn') cls.push('day-warn');
    if (d.rend === 'err')  cls.push('day-err');
    return cls;
}

function colAttrs(d: Day, i: number) {
    if (i === 6) return {};
    if (i === 5) return { class: 'weekend-col we-col' };
    return {};
}

function colStyle(d: Day, i: number) {
    if (i === 6) return '';
    if (i === 5) return 'width:56px';
    return 'width:64px';
}

function totalsCellCls(d: Day, i: number, row: 'tp' | 'zuc' | 'delta'): string[] {
    if (i === 5) return ['weekend-col', 'we-col', 'text-xs', 'opacity-35'];
    if (d.holiday) return ['holiday-col', 'text-xs'];
    const cls: string[] = [];
    if (i === 4) cls.push('today-col');
    if (d.rend === 'ok')   cls.push('day-ok');
    if (d.rend === 'warn') cls.push('day-warn');
    if (d.rend === 'err')  cls.push('day-err');
    if (row === 'tp' && i === 4) cls.push('text-primary');
    return cls;
}

const tpWeekTotal    = computed(() => ts.totalsRow.tp.reduce((a, b) => a + b, 0));
const zucWeekTotal   = computed(() => ts.totalsRow.zuc.reduce((a, b) => a + b, 0));
const deltaWeekTotal = computed(() => {
    const d = +(zucWeekTotal.value - tpWeekTotal.value).toFixed(1);
    return d <= 0 ? '✓' : `−${d}h`;
});
</script>
