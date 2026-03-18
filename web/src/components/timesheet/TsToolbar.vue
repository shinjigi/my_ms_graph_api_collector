<template>
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

            <button
                class="btn btn-xs btn-outline btn-warning"
                @click="$emit('open-verifica')"
            >Verifica concordanza</button>

            <button
                class="btn btn-xs btn-outline btn-primary"
                :disabled="submitDisabled || submitting"
                @click="runSubmit"
                :title="submitDisabled ? 'Nessuna modifica da inviare' : 'Invia ore a TargetProcess'"
            >
                <span v-if="submitting" class="loading loading-spinner loading-xs"></span>
                <span v-else>Invia a TP</span>
                <span v-if="pendingEditsCount > 0" class="badge badge-xs badge-primary">{{ pendingEditsCount }}</span>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useUiStore } from '../../stores/useUiStore';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { usePickerStore } from '../../stores/usePickerStore';
import { DAYABB_IT, WORKDAY_HOURS, HALF_WORKDAY_HOURS } from '../../mock/data';

defineEmits<{ (e: 'open-verifica'): void }>();

const ui     = useUiStore();
const ts     = useTimesheetStore();
const picker = usePickerStore();

// ---- Quick-fill ----

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

// ---- Submit to TP ----

const submitting = ref(false);
const submitMsg  = ref('');
const submitMsgCls = ref('text-success');

const pendingEditsCount = computed(() =>
    Object.values(ts.hoursEdits).filter(h => h > 0).length
);

const submitDisabled = computed(() => pendingEditsCount.value === 0 || submitting.value);

async function runSubmit() {
    if (submitDisabled.value) return;
    submitting.value = true;
    submitMsg.value  = '';
    try {
        const result = await ts.submitWeekHours();
        if (result.errors.length === 0) {
            submitMsg.value    = `✓ ${result.submitted} ore inviate a TP`;
            submitMsgCls.value = 'text-success';
        } else {
            submitMsg.value    = `⚠ ${result.submitted} ok, ${result.errors.length} errori`;
            submitMsgCls.value = 'text-warning';
        }
    } catch (err) {
        submitMsg.value    = `✗ Errore: ${(err as Error).message}`;
        submitMsgCls.value = 'text-error';
    } finally {
        submitting.value = false;
    }
}

defineExpose({ submitMsg, submitMsgCls });
</script>
