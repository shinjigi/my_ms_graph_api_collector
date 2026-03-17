<template>
    <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body p-4">
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <div class="card-title text-sm">Timesheet settimanale · TargetProcess</div>
                    <div class="badge badge-outline badge-xs">User Stories</div>
                    <div class="badge badge-outline badge-xs">Tasks</div>
                </div>
                <div class="flex items-center gap-2">
                    <button
                        class="btn btn-xs btn-ghost gap-1"
                        :class="{ 'btn-active': ui.weVisible }"
                        @click="ui.toggleWE()"
                        title="Mostra/nascondi weekend"
                    >
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"/>
                        </svg>
                        +WE
                    </button>

                    <!-- Quick-fill: applies to selected weekday column -->
                    <div class="flex items-center gap-1 border-l border-base-300 pl-2">
                        <span class="text-xs text-base-content/35 mr-1 shrink-0">
                            {{ selectedDayLabel ?? '–' }}
                        </span>
                        <button class="btn btn-xs btn-ghost"        :disabled="fillDisabled" @click="fillDay(WORKDAY_HOURS)"      title="Compila giornata intera SW (7:42)">SW 7:42</button>
                        <button class="btn btn-xs btn-ghost"        :disabled="fillDisabled" @click="fillDay(HALF_WORKDAY_HOURS)" title="Compila mezza giornata SW (3:51)">½ SW</button>
                        <button class="btn btn-xs btn-ghost btn-warning opacity-70" :disabled="fillDisabled" @click="fillDay(0)"                   title="Azzera giornata (ferie intere)">Ferie</button>
                        <button class="btn btn-xs btn-ghost btn-warning opacity-70" :disabled="fillDisabled" @click="fillDay(HALF_WORKDAY_HOURS)" title="Mezza giornata ferie + mezza SW (3:51)">½ Ferie</button>
                    </div>

                    <span class="text-xs text-base-content/30 italic">{{ verificaLabel }}</span>
                    <button class="btn btn-xs btn-outline btn-warning" @click="runVerifica">Verifica concordanza</button>
                </div>
            </div>
            <TimesheetTable />
            <div class="flex items-center gap-3 mt-3 pt-2 border-t border-base-300 text-xs text-base-content/30 italic">
                <span>Clicca intestazione giorno → vista dettaglio · Hover ore → ±0.5h · Click ore → input diretto</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed }        from 'vue';
import { useUiStore }           from '../../stores/useUiStore';
import { useTimesheetStore }    from '../../stores/useTimesheetStore';
import { usePickerStore }       from '../../stores/usePickerStore';
import { DAYABB_IT, WORKDAY_HOURS, HALF_WORKDAY_HOURS } from '../../mock/data';
import TimesheetTable           from './TimesheetTable.vue';

const ui     = useUiStore();
const ts     = useTimesheetStore();
const picker = usePickerStore();

const verificaLabel = ref('Ultima verifica: —');

function runVerifica() {
    const now = new Date();
    verificaLabel.value = `Ultima verifica: oggi ${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
}

const selectedDayLabel = computed(() => {
    const idx = picker.selectedDayIdx;
    if (idx < 0) return null;
    const d = picker.pickerSelected;
    return `${DAYABB_IT[d.getDay()]} ${d.getDate()}`;
});

const fillDisabled = computed(() => picker.selectedDayIdx < 0);

function fillDay(hours: number) {
    ts.fillDay(picker.selectedDayIdx, hours);
}
</script>
