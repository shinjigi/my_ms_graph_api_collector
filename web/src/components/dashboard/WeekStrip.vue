<template>
    <div class="bg-base-100 border border-base-300 rounded-xl p-3 mb-3 flex items-center gap-2 overflow-x-auto">
        <button class="btn btn-ghost btn-xs btn-square shrink-0">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
        </button>
        <div class="flex gap-2 flex-1">
            <div
                v-for="(card, i) in weekCards"
                :key="i"
                class="week-card flex-1"
                :class="[
                    card.rendCls,
                    card.isSelected ? 'active' : '',
                    card.isToday    ? 'outline outline-2 outline-offset-1 outline-primary/60' : '',
                ]"
                @click="picker.selectDay(card.date.getFullYear(), card.date.getMonth(), card.date.getDate())"
            >
                <div class="flex items-center justify-between mb-1">
                    <span class="text-xs font-bold" :class="card.isSelected ? 'text-primary' : ''">{{ card.dateLabel }}</span>
                    <span class="text-xs font-bold" :class="card.rendIconCls" v-html="card.rendIcon"></span>
                </div>
                <div class="text-xs text-base-content/50">
                    <span class="text-success font-medium">{{ card.zucH }}h</span> Zuc
                    <span class="mx-1 text-base-content/20">·</span>
                    <span class="text-primary font-medium">{{ card.tpH }}h</span> TP
                </div>
                <div class="text-xs text-base-content/30 mt-0.5 flex items-center gap-1">
                    <span v-if="card.location === 'smart'"  class="text-info text-sm leading-none"         title="Smart working">⌂</span>
                    <span v-else-if="card.location === 'office'" class="text-base-content/30 text-sm leading-none" title="In ufficio">⊡</span>
                    <span v-else-if="card.location === 'mixed'" class="text-warning text-sm leading-none"  title="Misto">◐</span>
                    <span>{{ card.nibol?.type || '—' }}</span>
                </div>
            </div>
        </div>
        <button class="btn btn-ghost btn-xs btn-square shrink-0">
            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
        </button>
    </div>
</template>

<script setup lang="ts">
import { computed }           from 'vue';
import { usePickerStore }     from '../../stores/usePickerStore';
import { useTimesheetStore }  from '../../stores/useTimesheetStore';

const picker = usePickerStore();
const ts     = useTimesheetStore();

const weekCards = computed(() => {
    const sel = picker.pickerSelected;
    const dow = sel.getDay();
    const monday = new Date(sel);
    monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));

    return ts.days.slice(0, 5).map((d, i) => {
        const date      = new Date(monday);
        date.setDate(monday.getDate() + i);
        const monAbbr   = date.toLocaleDateString('it-IT', { month: 'short' });
        const dateLabel = `${date.getDate()} ${monAbbr.charAt(0).toUpperCase() + monAbbr.slice(1,3)}`;
        const isSelected = date.toDateString() === sel.toDateString();
        const isToday    = date.toDateString() === picker.pickerToday.toDateString();
        const tpH        = +ts.active.reduce((acc, r) => acc + ts.getHours(r.tpId, i), 0).toFixed(1);

        const r        = ts.rendPerDay[i] ?? null;
        const rendCls  = r === 'ok' ? 'rend-ok' : r === 'warn' ? 'rend-warn' : r === 'err' ? 'rend-err' : '';
        const rendIcon = r === 'ok' ? '✓' : r === 'warn' ? '⚠' : r === 'err' ? '✗' : '·';
        const rendIconCls = r === 'ok' ? 'text-success' : r === 'warn' ? 'text-warning' : r === 'err' ? 'text-error' : 'text-base-content/20';

        return { date, dateLabel, isSelected, isToday, rendCls, rendIcon, rendIconCls, zucH: d.zucHours, tpH, nibol: d.nibol, location: d.location };
    });
});
</script>
