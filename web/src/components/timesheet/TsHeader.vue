<template>
    <thead>
        <tr class="text-xs">
            <th>User Story</th>
            <th>Stato</th>
            <th v-for="(d, i) in ts.days.slice(0, 6)" :key="i"
                class="text-center text-xs"
                :class="dayHeadCls(d, i)">
                <template v-if="i === 5">
                    <span class="flex flex-col items-center opacity-55 cursor-pointer select-none"
                          @click="ui.toggleWE()"
                          :title="ui.weVisible ? 'Nascondi weekend' : 'Mostra weekend'">
                        <span class="font-bold">WE</span>
                        <span class="font-normal text-xxs">Sab · Dom</span>
                        <span class="text-xxs mt-0.5">{{ ui.weVisible ? '▾' : '▸' }}</span>
                    </span>
                </template>
                <template v-else-if="d.holiday">
                    <span class="flex flex-col items-center gap-0.5 opacity-80" :title="d.holidayName">
                        <span>{{ d.label }}</span>
                        <span class="font-normal text-xs">{{ d.date }}</span>
                        <span class="ts-holiday-hint">Festività</span>
                    </span>
                </template>
                <template v-else>
                    <span class="day-header-cell flex flex-col items-center gap-0.5"
                          @click="selectTsDay(i)">
                        <span :class="isToday(d, i) ? 'text-primary font-bold' : ''">{{ d.label }}</span>
                        <span class="font-normal opacity-60 text-xs">{{ d.date }}</span>
                        <span class="text-xs font-bold" :class="rendIconCls(rend(i))">{{ rendIcon(rend(i)) }}</span>
                    </span>
                </template>
            </th>
            <th class="text-center text-xs">Tot</th>
            <th class="text-center text-xs opacity-60">Rem</th>
        </tr>
    </thead>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { usePickerStore } from '../../stores/usePickerStore';
import { useUiStore } from '../../stores/useUiStore';
import type { Day } from '../../types';

const router = useRouter();
const ts     = useTimesheetStore();
const picker = usePickerStore();
const ui     = useUiStore();

function selectTsDay(i: number) {
    const dObj = ts.days[i];
    if (!dObj) return;
    const dateStr = ts.weekData?.days[i]?.date || dObj.date; // Use original date if available
    const date = new Date(dateStr);
    const yr  = date.getFullYear();
    const mo  = String(date.getMonth() + 1).padStart(2, '0');
    const d   = String(date.getDate()).padStart(2, '0');
    router.push(`/dashboard/${yr}-${mo}-${d}`);
}

function isToday(d: Day, i: number): boolean {
    const dayDate = ts.weekData?.days[i]?.date;
    if (!dayDate) return false;
    return new Date(dayDate).toDateString() === picker.pickerToday.toDateString();
}

const rendIcon    = (r: Day['rend']) => r === 'ok' ? '✓' : r === 'warn' ? '⚠' : r === 'err' ? '✗' : '';
const rendIconCls = (r: Day['rend']) => r === 'ok' ? 'text-success' : r === 'warn' ? 'text-warning' : r === 'err' ? 'text-error opacity-80' : 'opacity-0';
const rend = (i: number) => ts.rendPerDay[i] ?? null;

function dayHeadCls(d: Day, i: number): string[] {
    const cls: string[] = [];
    if (i === 5) { cls.push('weekend-col', 'we-col'); return cls; }
    if (d?.holiday) {
        cls.push('holiday-col');
    } else {
        const r = rend(i);
        if (r === 'ok')   cls.push('day-ok');
        if (r === 'warn') cls.push('day-warn');
        if (r === 'err')  cls.push('day-err');
    }
    if (isToday(d, i))               cls.push('today-col');
    if (i === picker.selectedDayIdx) cls.push('selected-col');
    return cls;
}
</script>
