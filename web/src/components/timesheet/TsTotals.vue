<template>
    <tbody>
        <DayLocationPopover ref="popover" />
        <tr class="text-xs ts-totals-bg">
            <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Ore TP</td>
            <td v-for="(d, i) in ts.days.slice(0, 5)" :key="i" class="text-center text-xs font-bold" :class="totalsCellCls(d, i, 'tp')">
                <template v-if="d.holiday && !(d.holidayType === 'absence' && ts.totalsRow.tp[i] > 0)">{{ d.holidayType === 'absence' ? '🏖️' : '🇮🇹' }}</template>
                <template v-else>{{ +ts.totalsRow.tp[i].toFixed(1) || '—' }}</template>
            </td>
            <td class="text-center text-xs font-bold weekend-col we-col opacity-35">—</td>
            <td v-if="ui.weVisible" class="text-center text-xs font-bold weekend-col opacity-35">—</td>
            <td class="text-center font-bold text-primary text-xs">{{ +ts.tpWeekTotal.toFixed(1) }}h</td>
            <td></td>
        </tr>
        <tr class="text-xs ts-totals-bg">
            <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Zucchetti</td>
            <td v-for="(d, i) in ts.days.slice(0, 5)" :key="i" 
                class="text-center text-xs font-bold" 
                :class="totalsCellCls(d, i, 'zuc')">
                <template v-if="d.holiday">{{ d.holidayType === 'absence' ? '🏖️' : '🇮🇹' }}</template>
                <template v-else-if="d.zucHours > 0 || zucGiust(i).length > 0">
                    <div class="flex flex-col items-center gap-0.5 py-0.5 cursor-pointer" @click="popover?.open(i)">
                        <span v-if="d.zucHours > 0" class="text-success">{{ d.zucHours }}</span>
                        <div v-if="zucBadges(d, i).length > 0" class="flex flex-wrap gap-0.5 justify-center">
                            <span v-for="b in zucBadges(d, i)" :key="b.emoji"
                                  class="ts-badge" :title="b.title">{{ b.emoji }}</span>
                        </div>
                    </div>
                </template>
                <template v-else>
                    <span class="err-x font-black text-sm cursor-pointer" @click="popover?.open(i)">✗</span>
                </template>
            </td>
            <td class="text-center text-xs font-bold weekend-col we-col opacity-35">—</td>
            <td v-if="ui.weVisible" class="text-center text-xs font-bold weekend-col opacity-35">—</td>
            <td class="text-center font-bold text-success text-xs">{{ +ts.zucWeekTotal.toFixed(1) }}h</td>
            <td></td>
        </tr>
        <tr class="text-xs border-b-2 border-base-300 ts-totals-bg">
            <td colspan="2" class="text-right pr-3 text-base-content/50 text-xs font-semibold">Delta</td>
            <td v-for="(d, i) in ts.days.slice(0, 5)" :key="i" class="text-center text-xs" :class="totalsCellCls(d, i, 'delta')">
                <template v-if="d.holiday && !(d.holidayType === 'absence' && ts.totalsRow.tp[i] > 0)">—</template>
                <template v-else>
                    <span :class="getDeltaHoursCls(ts.totalsRow.delta[i], d.holidayType === 'absence' && ts.totalsRow.tp[i] > 0)">
                        {{ formatDeltaHours(ts.totalsRow.delta[i]) }}
                    </span>
                </template>
            </td>
            <td class="text-center text-xs weekend-col we-col opacity-35">—</td>
            <td v-if="ui.weVisible" class="text-center text-xs weekend-col opacity-35">—</td>
            <td class="text-center font-bold text-xs" :class="getDeltaHoursCls(ts.windowDeltaTotal)">{{ formatDeltaHours(ts.windowDeltaTotal) }}</td>
            <td></td>
        </tr>
    </tbody>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useTimesheetStore } from "../../stores/useTimesheetStore";
import { useUiStore }                            from '../../stores/useUiStore';
import { locationEmoji, locationTitle, giustActivityEmojis, formatDeltaHours, getDeltaHoursCls } from '../../utils';
import type { Day } from '../../types';
import type { ZucchettiJustification } from '@shared/zucchetti';
import DayLocationPopover from './DayLocationPopover.vue';

const ts     = useTimesheetStore();
const ui     = useUiStore();

const popover = ref<InstanceType<typeof DayLocationPopover> | null>(null);

function isToday(i: number): boolean {
    return ts.getDayColCls(i).includes('today-col');
}

function totalsCellCls(d: Day, i: number, row: 'tp' | 'zuc' | 'delta'): string[] {
    const cls = ts.getDayColCls(i);
    if (row === 'tp' && cls.includes('today-col')) {
        cls.push('text-primary');
    }
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
</script>

<style scoped>
.ts-totals-bg { background: hsl(var(--b2) / 0.55); }
.day-err .err-x { color: #fff; font-weight: 900; text-shadow: 0 0 4px #0006; }
</style>
