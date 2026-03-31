<template>
    <tbody>
        <DayLocationPopover ref="popover" />
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
            <td v-for="(d, i) in ts.days.slice(0, 5)" :key="i" 
                class="text-center text-xs font-bold" 
                :class="totalsCellCls(d, i, 'zuc')">
                <template v-if="d.holiday">🇮🇹</template>
                <template v-else-if="d.zucHours > 0 || zucGiust(i).length > 0">
                    <div class="flex flex-col items-center gap-0.5 py-0.5 cursor-pointer" @click="popover?.open(i)">
                        <span v-if="d.zucHours > 0" class="text-success">{{ d.zucHours }}</span>
                        <div v-if="zucBadges(d, i).length > 0" class="flex flex-wrap gap-0.5 justify-center">
                            <span v-for="b in zucBadges(d, i)" :key="b.emoji"
                                  class="zuc-badge" :title="b.title">{{ b.emoji }}</span>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <span class="err-x font-black text-sm cursor-pointer" @click="popover?.open(i)">✗</span>
                </template>
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
import { computed, ref } from 'vue';
import { useTimesheetStore }                     from '../../stores/useTimesheetStore';
import { usePickerStore }                        from '../../stores/usePickerStore';
import { useUiStore }                            from '../../stores/useUiStore';
import { locationEmoji, locationTitle, giustActivityEmojis } from '../../utils';
import type { Day } from '../../types';
import type { ZucchettiJustification } from '@shared/zucchetti';
import DayLocationPopover from './DayLocationPopover.vue';

const ts     = useTimesheetStore();
const picker = usePickerStore();
const ui     = useUiStore();

const popover = ref<InstanceType<typeof DayLocationPopover> | null>(null);

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

function zucGiust(i: number): ZucchettiJustification[] {
    return ts.weekData?.days[i]?.zucchetti?.giustificativi ?? [];
}

interface Badge { emoji: string; title: string }

function zucBadges(d: Day, i: number): Badge[] {
    const badges: Badge[] = [];
    if (d.location) {
        badges.push({ emoji: locationEmoji(d.location), title: locationTitle(d.location) });
    }
    for (const emoji of giustActivityEmojis(zucGiust(i))) {
        badges.push({ emoji, title: emoji });
    }
    return badges;
}

const tpWeekTotal    = computed(() => ts.totalsRow.tp.reduce((a, b) => a + b, 0));
const zucWeekTotal   = computed(() => ts.days.reduce((a, d) => a + (d.zucHours || 0), 0).toFixed(1));
const deltaWeekTotal = computed(() => {
    const d = +(+zucWeekTotal.value - tpWeekTotal.value).toFixed(1);
    return (d === 0) ? '✓' : d > 0 ? `−${d}h` : `+${Math.abs(d)}h`;
});
</script>

<style scoped>
.zuc-badge {
    font-size: 0.7rem;
    line-height: 1;
    padding: 1px 3px;
    border-radius: 3px;
    background: oklch(var(--b3));
    display: inline-flex;
    align-items: center;
    cursor: default;
}
</style>
