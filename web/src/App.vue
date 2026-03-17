<template>
    <div class="flex h-screen overflow-hidden bg-base-200">
        <AppSidebar />
        <div class="flex-1 flex flex-col overflow-hidden">
            <DayPickerHeader />
            <main class="flex-1 overflow-auto p-4">

                <!-- Dashboard -->
                <div v-show="ui.activeView === 'dashboard'">
                    <StatStrip />
                    <WeekStrip />
                    <!-- Day header -->
                    <div class="flex items-center gap-3 mb-3 flex-wrap">
                        <h2 class="text-base font-bold">{{ dayLabel }}</h2>
                        <div class="badge badge-outline badge-sm gap-1">🏠 Smart Working</div>
                        <div class="badge badge-warning badge-outline badge-sm gap-1">⚠ Da rendicontare</div>
                        <button class="btn btn-xs btn-outline btn-warning ml-auto">Verifica</button>
                    </div>
                    <div class="grid gap-3 items-start" style="grid-template-columns: 240px minmax(0,2fr) minmax(0,3fr);">
                        <TimelinePanel @highlight-us="highlightUs = $event" @clear-highlight="highlightUs = ''" />
                        <WorkTpPanel :highlighted-us="highlightUs" />
                        <SignalsGrid />
                    </div>
                </div>

                <!-- Timesheet -->
                <div v-show="ui.activeView === 'timesheet'">
                    <TimesheetView />
                </div>

                <!-- Activity -->
                <div v-show="ui.activeView === 'activity'">
                    <div class="card bg-base-100 shadow-sm border border-base-300">
                        <div class="card-body p-4">
                            <div class="card-title text-sm mb-3">Timeline commit</div>
                            <div class="text-xs text-base-content/40 italic">Activity view — dati reali da API</div>
                        </div>
                    </div>
                </div>

                <!-- Teams -->
                <div v-show="ui.activeView === 'teams'">
                    <div class="card bg-base-100 shadow-sm border border-base-300">
                        <div class="card-body p-4">
                            <div class="card-title text-sm mb-3">Teams / Chat</div>
                            <div class="text-xs text-base-content/40 italic">Teams view — dati reali da API</div>
                        </div>
                    </div>
                </div>

                <!-- Browser -->
                <div v-show="ui.activeView === 'browser'">
                    <div class="card bg-base-100 shadow-sm border border-base-300">
                        <div class="card-body p-4">
                            <div class="card-title text-sm mb-3">Browser history</div>
                            <div class="text-xs text-base-content/40 italic">Browser view — dati reali da API</div>
                        </div>
                    </div>
                </div>

            </main>
        </div>

        <!-- AI FAB -->
        <button class="fixed bottom-4 right-4 btn btn-primary btn-circle shadow-lg z-50" @click="ui.toggleAiChat()" title="AI Assistant">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-3 3-3-3z"/>
            </svg>
        </button>

        <!-- Email modal -->
        <dialog class="modal modal-bottom sm:modal-middle" :open="ui.emailModalId !== null">
            <div class="modal-box max-w-xl" v-if="openEmail">
                <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="ui.closeEmail()">✕</button>
                <div class="flex items-start gap-2 mb-1">
                    <span class="badge badge-xs" :class="openEmail.dir === 'in' ? 'badge-success' : 'badge-info'">
                        {{ openEmail.dir === 'in' ? '↓ Ricevuta' : '↑ Inviata' }}
                    </span>
                    <h3 class="font-bold text-sm flex-1">{{ openEmail.subject }}</h3>
                </div>
                <div class="text-xs text-base-content/40 mb-1">
                    {{ openEmail.dir === 'in' ? 'Da' : 'A' }}: {{ openEmail.dir === 'in' ? openEmail.from : openEmail.to }} · {{ openEmail.time }}
                </div>
                <div class="divider my-2"></div>
                <div class="text-sm leading-relaxed whitespace-pre-line bg-base-200 rounded-lg p-4 max-h-64 overflow-y-auto">
                    {{ openEmail.body }}
                </div>
                <div class="modal-action mt-3">
                    <button class="btn btn-sm" @click="ui.closeEmail()">Chiudi</button>
                </div>
            </div>
            <form method="dialog" class="modal-backdrop"><button @click="ui.closeEmail()">close</button></form>
        </dialog>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useUiStore }         from './stores/useUiStore';
import { usePickerStore }     from './stores/usePickerStore';
import { useDayStore }        from './stores/useDayStore';
import { useTimesheetStore }  from './stores/useTimesheetStore';
import AppSidebar             from './components/layout/AppSidebar.vue';
import DayPickerHeader        from './components/layout/DayPickerHeader.vue';
import StatStrip              from './components/dashboard/StatStrip.vue';
import WeekStrip              from './components/dashboard/WeekStrip.vue';
import TimelinePanel          from './components/dashboard/TimelinePanel.vue';
import WorkTpPanel            from './components/dashboard/WorkTpPanel.vue';
import SignalsGrid             from './components/dashboard/SignalsGrid.vue';
import TimesheetView          from './components/timesheet/TimesheetView.vue';

const ui     = useUiStore();
const picker = usePickerStore();
const day    = useDayStore();
const ts     = useTimesheetStore();

onMounted(() => {
    const todayMonday = (() => {
        const d = new Date(picker.pickerSelected);
        d.setHours(0, 0, 0, 0);
        const dow = d.getDay();
        d.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1));
        return d.toISOString().slice(0, 10);
    })();
    ts.fetchWeekData(todayMonday);
});

const highlightUs = ref('');

const dayLabel = computed(() =>
    picker.pickerSelected.toLocaleDateString('it-IT', {
        weekday: 'long', day: 'numeric', month: 'short', year: 'numeric',
    })
);

const openEmail = computed(() => {
    if (ui.emailModalId === null) return null;
    return day.emails[ui.emailModalId] ?? null;
});
</script>
