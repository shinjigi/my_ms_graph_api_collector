<template>
    <div>
        <!-- Dashboard -->
        <template v-if="view === 'dashboard'">
            <StatStrip />
            <WeekStrip />
            <div class="flex items-center gap-3 mb-3 flex-wrap">
                <h2 class="text-base font-bold">{{ dayLabel }}</h2>
                <div v-if="dayLocation === 'smart'" class="badge badge-outline badge-sm gap-1">🏠 Smart Working</div>
                <div v-else-if="dayLocation === 'office'" class="badge badge-outline badge-sm gap-1">🏢 Ufficio</div>
                <div v-if="dayRendStatus === 'warn' || dayRendStatus === 'err'" class="badge badge-warning badge-outline badge-sm gap-1">⚠ Da rendicontare</div>
                <button class="btn btn-xs btn-outline btn-warning ml-auto" @click="ui.setView('timesheet'); router.push(`/timesheet/${date}`)">Verifica</button>
            </div>
            <div class="grid gap-3 items-start" style="grid-template-columns: 240px minmax(0,2fr) minmax(0,3fr);">
                <TimelinePanel @highlight-us="highlightUs = $event" @clear-highlight="highlightUs = ''" />
                <WorkTpPanel :highlighted-us="highlightUs" />
                <SignalsGrid />
            </div>
        </template>

        <!-- Timesheet -->
        <template v-else-if="view === 'timesheet'">
            <TimesheetView />
        </template>

        <!-- Activity -->
        <template v-else-if="view === 'activity'">
            <ActivityView />
        </template>

        <!-- Teams -->
        <template v-else-if="view === 'teams'">
            <TeamsView />
        </template>

        <!-- Browser -->
        <template v-else-if="view === 'browser'">
            <BrowserView />
        </template>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useUiStore }        from '../stores/useUiStore';
import { usePickerStore }    from '../stores/usePickerStore';
import { useTimesheetStore } from '../stores/useTimesheetStore';
import { useDayStore }       from '../stores/useDayStore';
import type { ActiveView }   from '../types';
import StatStrip             from '../components/dashboard/StatStrip.vue';
import WeekStrip             from '../components/dashboard/WeekStrip.vue';
import TimelinePanel         from '../components/dashboard/TimelinePanel.vue';
import WorkTpPanel           from '../components/dashboard/WorkTpPanel.vue';
import SignalsGrid            from '../components/dashboard/SignalsGrid.vue';
import TimesheetView         from '../components/timesheet/TimesheetView.vue';
import ActivityView          from '../components/activity/ActivityView.vue';
import TeamsView             from '../components/teams/TeamsView.vue';
import BrowserView           from '../components/browser/BrowserView.vue';

const props = defineProps<{ view: string; date: string }>();

const router = useRouter();
const ui     = useUiStore();
const picker = usePickerStore();
const ts     = useTimesheetStore();
const day    = useDayStore();

const highlightUs = ref('');

// Sync store state from URL params on every route param change.
// URL is the source of truth: router → stores (never the other way around).
watch(() => [props.view, props.date] as const, ([newView, newDate]) => {
    // Sync active view
    ui.activeView = newView as ActiveView;

    // Sync picker — parse date as local (YYYY-MM-DD has no time, treat as local midnight)
    const parts = newDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (parts) {
        const yr  = parseInt(parts[1], 10);
        const mo  = parseInt(parts[2], 10) - 1;
        const d   = parseInt(parts[3], 10);
        const current = picker.pickerSelected;
        if (current.getFullYear() !== yr || current.getMonth() !== mo || current.getDate() !== d) {
            picker.setFromDate(new Date(yr, mo, d));
        }

        // Fetch week data from backend
        const monday = (() => {
            const m   = new Date(yr, mo, d);
            const dow = m.getDay();
            m.setDate(m.getDate() - (dow === 0 ? 6 : dow - 1));
            return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}-${String(m.getDate()).padStart(2, '0')}`;
        })();
        ts.fetchWeekData(monday);
    }
}, { immediate: true });

const dayLabel = computed(() =>
    picker.pickerSelected.toLocaleDateString('it-IT', {
        weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    })
);

const dayIdx = computed(() => picker.selectedDayIdx);

const dayLocation = computed(() => {
    const d = ts.days[dayIdx.value];
    return (d as unknown as { location?: string })?.location ?? null;
});

const dayRendStatus = computed(() =>
    dayIdx.value >= 0 ? (ts.rendPerDay[dayIdx.value] ?? null) : null
);
</script>
