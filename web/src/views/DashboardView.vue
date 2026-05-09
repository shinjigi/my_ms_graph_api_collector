<template>
    <div>
        <StatStrip />
        <WeekStrip />
        
        <div class="flex items-center gap-3 mb-3 flex-wrap">
            <h2 class="text-base font-bold">{{ dayLabel }}</h2>
            <div v-if="dayLocation && dayLocation !== 'unknown'" class="badge badge-outline badge-sm gap-1">
                {{ locationEmoji(dayLocation) }} {{ locationShortLabel(dayLocation) }}
            </div>
            <div v-if="dayRendStatus === 'warn' || dayRendStatus === 'err'" class="badge badge-warning badge-outline badge-sm gap-1">⚠ Da rendicontare</div>
            <button class="btn btn-xs btn-outline btn-warning ml-auto" @click="router.push(`/timesheet/${date}`)">Verifica</button>
        </div>
        
        <div class="grid gap-3 items-start" style="grid-template-columns: 240px minmax(0,2fr) minmax(0,3fr);">
            <TimelinePanel @highlight-us="highlightUs = $event" @clear-highlight="highlightUs = ''" />
            <WorkTpPanel :highlighted-us="highlightUs" />
            <SignalsGrid />
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import type { Day } from '../types';
import { usePickerStore } from '../stores/usePickerStore';
import { useTimesheetStore } from '../stores/useTimesheetStore';
import { useDayStatus } from '../composables/useDayStatus';
import { formatFullDateLabel } from '@shared/dates';
import { locationEmoji, locationShortLabel } from '../utils';

import StatStrip from '../components/dashboard/StatStrip.vue';
import WeekStrip from '../components/dashboard/WeekStrip.vue';
import TimelinePanel from '../components/dashboard/TimelinePanel.vue';
import WorkTpPanel from '../components/dashboard/WorkTpPanel.vue';
import SignalsGrid from '../components/dashboard/SignalsGrid.vue';

defineProps<{ date?: string }>();

const router = useRouter();
const picker = usePickerStore();
const ts = useTimesheetStore();
const { getStatus } = useDayStatus();

const highlightUs = ref('');

const dayLabel = computed(() => formatFullDateLabel(picker.pickerSelected));

const dayIdx = computed(() => picker.selectedDayIdx);

const dayLocation = computed(() => {
    return ts.days[dayIdx.value]?.location ?? null;
});

const dayRendStatus = computed(() =>
    dayIdx.value >= 0 ? (getStatus(dayIdx.value) ?? null) : null
);
</script>
