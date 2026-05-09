<template>
    <thead>
        <tr class="text-xs">
            <th>User Story</th>
            <th>Stato</th>
            <th v-for="(d, i) in ts.days.slice(0, 5)" :key="i"
                class="text-center text-xs"
                :class="status.getDayColCls(i)">
                <template v-if="d.holiday">
                    <span class="flex flex-col items-center gap-0.5 opacity-80" :title="d.holidayName">
                        <span>{{ d.label }}</span>
                        <span class="font-normal text-xs">{{ d.date }}</span>
                        <span class="ts-holiday-hint">{{ d.holidayType === 'absence' ? (d.holidayName ?? 'Assenza') : 'Festività' }}</span>
                    </span>
                </template>
                <template v-else>
                    <span class="day-header-cell flex flex-col items-center gap-0.5"
                          @click="selectTsDay(i)">
                        <span :class="status.isToday(i) ? 'text-primary font-bold' : ''">{{ d.label }}</span>
                        <span class="font-normal opacity-60 text-xs">{{ d.date }}</span>
                        <span class="text-xs font-bold" :class="rendStatusIconCls(status.getStatus(i))">{{ rendStatusIcon(status.getStatus(i)) }}</span>
                    </span>
                </template>
            </th>
            <!-- WE toggle / Sabato header -->
            <th class="text-center text-xs weekend-col we-col">
                <template v-if="!ui.weVisible">
                    <span class="flex flex-col items-center opacity-55 cursor-pointer select-none"
                          @click="ui.toggleWE()" title="Espandi Sabato e Domenica">
                        <span class="font-bold">WE</span>
                        <span class="font-normal text-xxs">Sab · Dom</span>
                        <span class="text-xxs mt-0.5">▸</span>
                    </span>
                </template>
                <template v-else>
                    <span class="flex flex-col items-center gap-0.5 cursor-pointer opacity-80 hover:opacity-100"
                          @click="ui.toggleWE()" title="Comprimi weekend">
                        <span>Sab</span>
                        <span class="font-normal opacity-60 text-xs">{{ ts.days[5]?.date ?? '' }}</span>
                        <span class="text-xxs opacity-55">◂◂</span>
                    </span>
                </template>
            </th>
            <!-- Domenica — solo quando WE espanso -->
            <th v-if="ui.weVisible" class="text-center text-xs weekend-col">
                <span class="flex flex-col items-center gap-0.5">
                    <span class="flex items-center gap-0.5">
                        <span>Dom</span>
                        <span class="opacity-55 cursor-pointer text-xxs ml-0.5" @click="ui.toggleWE()" title="Comprimi weekend">▾</span>
                    </span>
                    <span class="font-normal opacity-60 text-xs">{{ ts.days[6]?.date ?? '' }}</span>
                </span>
            </th>
            <th class="text-center text-xs">Tot</th>
            <th class="text-center text-xs opacity-60">Rem</th>
        </tr>
    </thead>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { useUiStore }        from '../../stores/useUiStore';
import { useDayStatus }     from '../../composables/useDayStatus';
import type { Day } from '../../types';
import { rendStatusIcon, rendStatusIconCls } from '../../utils';

const router = useRouter();
const ts     = useTimesheetStore();
const ui     = useUiStore();
const status = useDayStatus();

function selectTsDay(i: number) {
    const dObj = ts.days[i];
    if (!dObj) return;
    const dateStr = ts.weekData?.days[i]?.date || dObj.date;
    const date = new Date(dateStr);
    const yr  = date.getFullYear();
    const mo  = String(date.getMonth() + 1).padStart(2, '0');
    const d   = String(date.getDate()).padStart(2, '0');
    router.push(`/dashboard/${yr}-${mo}-${d}`);
}
</script>
