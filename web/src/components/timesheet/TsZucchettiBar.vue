<template>
    <div class="flex items-center gap-1.5">
        <span class="text-xs text-base-content/35 font-medium uppercase tracking-wide mr-1">Zucchetti</span>
        <span class="text-xs text-base-content/50 mr-1 shrink-0">
            {{ selectedDayLabel ?? '–' }}
        </span>
        <div class="dropdown dropdown-bottom">
            <label tabindex="0"
                   class="btn btn-xs btn-outline gap-1"
                   :class="{ 'btn-disabled': fillDisabled || busy }">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6"/>
                </svg>
                Richiesta
                <span v-if="busy" class="loading loading-spinner loading-xs"></span>
            </label>
            <ul tabindex="0" class="dropdown-content z-20 menu menu-xs p-1 shadow-lg bg-base-100 border border-base-300 rounded-box w-56">
                <li><a @click="doAction('SMART WORKING', true, WORKDAY_HOURS)">
                    <span class="font-medium">SW giornata intera</span>
                    <span class="text-base-content/40 ml-auto">7:42</span>
                </a></li>
                <li><a @click="doAction('SMART WORKING', false, HALF_WORKDAY_HOURS, 3, 51)">
                    <span class="font-medium">SW mezza giornata</span>
                    <span class="text-base-content/40 ml-auto">3:51</span>
                </a></li>
                <li class="border-t border-base-200 mt-1 pt-1">
                    <a @click="doAction('FERIE', true, 0)">
                        <span class="font-medium text-warning">Ferie giornata intera</span>
                    </a>
                </li>
                <li><a @click="doAction('FERIE', false, HALF_WORKDAY_HOURS, 3, 51)">
                    <span class="font-medium text-warning">Ferie mezza giornata</span>
                    <span class="text-base-content/40 ml-auto">3:51</span>
                </a></li>
            </ul>
        </div>
        <span v-if="msg" class="text-xs ml-1" :class="msgCls">{{ msg }}</span>
    </div>
</template>

<script setup lang="ts">
import { ref, computed }          from 'vue';
import { useTimesheetStore }       from '../../stores/useTimesheetStore';
import { usePickerStore }          from '../../stores/usePickerStore';
import { submitZucchettiRequest }  from '../../api';
import type { WeekDayResponse }    from '../../types';
import { DAYABB_IT, HALF_WORKDAY_HOURS, WORKDAY_HOURS } from '../../standards';

const ts     = useTimesheetStore();
const picker = usePickerStore();

const selectedDayLabel = computed(() => {
    const idx = picker.selectedDayIdx;
    if (idx < 0) return null;
    const d = picker.pickerSelected;
    return `${DAYABB_IT[d.getDay()]} ${d.getDate()}`;
});

const fillDisabled = computed(() => picker.selectedDayIdx < 0);

function selectedDateStr(): string {
    const d = picker.pickerSelected;
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
}

const busy   = ref(false);
const msg    = ref('');
const msgCls = ref('text-success');

async function doAction(type: string, fullDay: boolean, tpHours: number, hours?: number, minutes?: number) {
    if (fillDisabled.value || busy.value) return;

    busy.value = true;
    msg.value  = '';

    try {
        const result = await submitZucchettiRequest({
            date:    selectedDateStr(),
            type,
            fullDay,
            hours:   hours ?? 0,
            minutes: minutes ?? 0,
        });

        if (result.success) {
            msg.value    = result.skipped ? 'Già presente' : `✓ ${type}`;
            msgCls.value = result.skipped ? 'text-warning' : 'text-success';

            if (result.dayUpdate) {
                // dayUpdate is WeekDayData (shared type with unknown[] arrays);
                // at runtime the backend sends the fully typed structure — safe cast.
                ts.patchDay(picker.selectedDayIdx, result.dayUpdate as unknown as WeekDayResponse);
            }
            if (result.scrapeError) {
                console.warn('[TsZucchettiBar] Post-submit scrape failed:', result.scrapeError);
            }
        } else {
            msg.value    = `✗ ${result.message}`;
            msgCls.value = 'text-error';
        }

        ts.fillDay(picker.selectedDayIdx, tpHours);
    } catch (err) {
        msg.value    = `✗ ${(err as Error).message}`;
        msgCls.value = 'text-error';
    } finally {
        busy.value = false;
        setTimeout(() => { msg.value = ''; }, 8000);
    }
}
</script>
