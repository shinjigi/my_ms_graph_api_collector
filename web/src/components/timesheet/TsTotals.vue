<template>
    <tbody>
        <tr class="text-xs ts-totals-bg">
            <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Ore TP</td>
            <td v-for="(d, i) in ts.days.slice(0, 5)" :key="i" class="text-center text-xs font-bold" :class="totalsCellCls(d, i, 'tp')">
                <template v-if="d.holiday">🇮🇹</template>
                <template v-else>{{ ts.totalsRow.tp[i] || '—' }}</template>
            </td>
            <td class="text-center text-xs font-bold weekend-col we-col opacity-35">—</td>
            <td v-if="ui.weVisible" class="text-center text-xs font-bold weekend-col opacity-35">—</td>
            <td class="text-center font-bold text-primary text-xs">{{ tpWeekTotal }}</td>
            <td></td>
        </tr>
        <tr class="text-xs ts-totals-bg">
            <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Zucchetti</td>
            <td v-for="(d, i) in ts.days.slice(0, 5)" :key="i" class="text-center text-xs font-bold" :class="totalsCellCls(d, i, 'zuc')">
                <template v-if="d.holiday">🇮🇹</template>
                <template v-else-if="d.zucHours > 0">
                    <span class="inline-flex items-center justify-center gap-0.5">
                        <span class="text-success">{{ d.zucHours }}</span>
                        <span v-if="d.location === 'smart'"  class="text-info    text-sm leading-none" title="Smart working">⌂</span>
                        <span v-else-if="d.location === 'office'" class="text-base-content/30 text-sm leading-none" title="In ufficio">⊡</span>
                        <span v-else-if="d.location === 'mixed'" class="text-warning text-sm leading-none" title="Misto (uff. + SW)">◐</span>
                    </span>
                </template>
                <template v-else><span class="err-x font-black text-sm">✗</span></template>
            </td>
            <td class="text-center text-xs font-bold weekend-col we-col opacity-35">—</td>
            <td v-if="ui.weVisible" class="text-center text-xs font-bold weekend-col opacity-35">—</td>
            <td class="text-center font-bold text-success text-xs">{{ zucWeekTotal }}</td>
            <td></td>
        </tr>
        <tr class="text-xs border-b-2 border-base-300 ts-totals-bg">
            <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Delta</td>
            <td v-for="(d, i) in ts.days.slice(0, 5)" :key="i" class="text-center text-xs" :class="totalsCellCls(d, i, 'delta')">
                <template v-if="d.holiday">—</template>
                <template v-else>
                    <span :class="ts.totalsRow.delta[i] === 0 ? 'text-success font-black' : ts.totalsRow.delta[i] > 0 ? 'text-error' : 'text-base-content/40'">
                        {{ ts.totalsRow.delta[i] === 0 ? '✓' : ts.totalsRow.delta[i] > 0 ? `−${ts.totalsRow.delta[i]}h` : '—' }}
                    </span>
                </template>
            </td>
            <td class="text-center text-xs weekend-col we-col opacity-35">—</td>
            <td v-if="ui.weVisible" class="text-center text-xs weekend-col opacity-35">—</td>
            <td class="text-center font-bold text-error text-xs">{{ deltaWeekTotal }}</td>
            <td></td>
        </tr>
    </tbody>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { usePickerStore }    from '../../stores/usePickerStore';
import { useUiStore }        from '../../stores/useUiStore';
import type { Day } from '../../types';

const ts     = useTimesheetStore();
const picker = usePickerStore();
const ui     = useUiStore();

function isToday(i: number): boolean {
    const dayDate = ts.weekData?.days[i]?.date;
    if (!dayDate) return false;
    return new Date(dayDate).toDateString() === picker.pickerToday.toDateString();
}

function totalsCellCls(d: Day, i: number, row: 'tp' | 'zuc' | 'delta'): string[] {
    const cls: string[] = [];
    if (d?.holiday) {
        cls.push('holiday-col', 'text-xs');
    } else {
        const r = ts.rendPerDay[i] ?? null;
        if (r === 'ok')   cls.push('day-ok');
        if (r === 'warn') cls.push('day-warn');
        if (r === 'err')  cls.push('day-err');
        if (row === 'tp' && isToday(i)) cls.push('text-primary');
    }
    if (isToday(i))                  cls.push('today-col');
    if (i === picker.selectedDayIdx) cls.push('selected-col');
    return cls;
}

const tpWeekTotal    = computed(() => ts.totalsRow.tp.reduce((a, b) => a + b, 0));
const zucWeekTotal   = computed(() => ts.days.reduce((a, d) => a + (d.zucHours || 0), 0).toFixed(1));
const deltaWeekTotal = computed(() => {
    const d = +(+zucWeekTotal.value - tpWeekTotal.value).toFixed(1);
    return (d === 0) ? '✓' : d > 0 ? `−${d}h` : `+${Math.abs(d)}h`;
});
</script>
