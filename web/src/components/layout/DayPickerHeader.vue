<template>
    <header class="bg-base-100 border-b border-base-300 px-3 py-2 flex items-center gap-2 shrink-0">
        <button @click="picker.prevMonth()" class="btn btn-ghost btn-xs btn-square shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/>
            </svg>
        </button>
        <span class="text-sm font-semibold min-w-[7rem] text-center shrink-0 select-none">
            {{ picker.monthLabel }}
        </span>
        <button @click="picker.nextMonth()" class="btn btn-ghost btn-xs btn-square shrink-0">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
            </svg>
        </button>
        <button @click="picker.goToday()" class="btn btn-ghost btn-xs shrink-0">Oggi</button>

        <div ref="scrollRef" class="day-picker-btns flex gap-0.5 overflow-x-auto flex-1 py-0.5">
            <button
                v-for="day in picker.daysInMonth"
                :key="day.num"
                class="day-btn"
                :class="{
                    'day-btn-today':    day.isToday,
                    'day-btn-selected': day.isSelected && !day.isToday,
                    'day-btn-weekend':  day.isWeekend,
                    'day-btn-holiday':  day.isHoliday,
                }"
                :title="day.holidayName"
                @click="picker.selectDay(day.date.getFullYear(), day.date.getMonth(), day.date.getDate())"
            >
                <span class="day-num">{{ day.num }}</span>
                <span class="day-abbr">{{ day.abbr }}</span>
            </button>
        </div>

        <div class="flex items-center gap-2 text-xs text-base-content/35 shrink-0 pl-2 border-l border-base-300">
            <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-sm inline-block" style="background:hsl(142 60% 45%/0.5)"></span>Rend.
            </span>
            <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-sm inline-block" style="background:hsl(38 90% 55%/0.5)"></span>Parz.
            </span>
            <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-sm inline-block" style="background:hsl(0 72% 55%/0.5)"></span>Mancante
            </span>
            <span class="flex items-center gap-1">
                <span class="w-2 h-2 rounded-sm inline-block" style="background:hsl(280 60% 50%/0.4)"></span>Festività
            </span>
        </div>
    </header>
</template>

<script setup lang="ts">
import { ref, watch, nextTick } from 'vue';
import { usePickerStore }       from '../../stores/usePickerStore';

const picker    = usePickerStore();
const scrollRef = ref<HTMLElement | null>(null);

watch(() => picker.pickerSelected, async () => {
    await nextTick();
    const target = scrollRef.value?.querySelector('.day-btn-selected, .day-btn-today') as HTMLElement | null;
    target?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
}, { immediate: true });
</script>
