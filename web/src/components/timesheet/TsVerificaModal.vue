<template>
    <dialog class="modal modal-bottom sm:modal-middle" :open="open" @close="$emit('close')">
        <div class="modal-box max-w-xl">
            <button class="btn btn-sm btn-circle btn-ghost absolute right-2 top-2" @click="$emit('close')">✕</button>
            <h3 class="font-bold text-sm mb-4">Verifica concordanza settimana</h3>
            <table class="table table-xs w-full mb-4">
                <thead>
                    <tr class="text-xs">
                        <th>Giorno</th>
                        <th class="text-center">Zucchetti</th>
                        <th class="text-center">TP loggato</th>
                        <th class="text-center">Delta</th>
                        <th class="text-center">Stato</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in verificaRows" :key="row.label" class="text-xs">
                        <td :class="row.isToday ? 'font-bold text-primary' : ''">{{ row.label }}</td>
                        <td class="text-center">{{ row.zuc > 0 ? row.zuc + 'h' : '—' }}</td>
                        <td class="text-center">{{ row.tp > 0 ? row.tp + 'h' : '—' }}</td>
                        <td class="text-center">
                            <span v-if="row.status === 'skip'" class="opacity-30">—</span>
                            <span v-else-if="row.status === 'ok'" class="text-success font-bold">✓</span>
                            <span v-else-if="row.status === 'over'" class="text-warning">+{{ Math.abs(row.delta) }}h</span>
                            <span v-else class="text-error">−{{ row.delta }}h</span>
                        </td>
                        <td class="text-center">
                            <span v-if="row.status === 'ok'"   class="badge badge-xs badge-success">OK</span>
                            <span v-else-if="row.status === 'over'" class="badge badge-xs badge-warning">Over</span>
                            <span v-else-if="row.status === 'err'"  class="badge badge-xs badge-error">Mancante</span>
                            <span v-else-if="row.status === 'warn'" class="badge badge-xs badge-warning">Parziale</span>
                            <span v-else class="opacity-30 text-xs">—</span>
                        </td>
                    </tr>
                </tbody>
                <tfoot>
                    <tr class="font-bold text-xs">
                        <td>Totale settimana</td>
                        <td class="text-center">{{ totalZuc }}h</td>
                        <td class="text-center">{{ totalTp }}h</td>
                        <td class="text-center" :class="totalDelta === 0 ? 'text-success' : 'text-error'">
                            {{ totalDelta === 0 ? '✓' : (totalDelta > 0 ? '−' + totalDelta : '+' + Math.abs(totalDelta)) + 'h' }}
                        </td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            <div v-if="pendingEditsCount > 0" class="alert alert-info text-xs p-2 mb-3">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>Hai {{ pendingEditsCount }} ore modificate non ancora inviate a TP.</span>
            </div>
            <div class="modal-action mt-2">
                <button class="btn btn-sm" @click="$emit('close')">Chiudi</button>
            </div>
        </div>
        <form method="dialog" class="modal-backdrop"><button @click="$emit('close')">close</button></form>
    </dialog>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { usePickerStore } from '../../stores/usePickerStore';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const ts     = useTimesheetStore();
const picker = usePickerStore();

interface VerificaRow {
    label:   string;
    zuc:     number;
    tp:      number;
    delta:   number;
    status:  'ok' | 'warn' | 'err' | 'over' | 'skip';
    isToday: boolean;
}

const verificaRows = computed<VerificaRow[]>(() =>
    ts.days.slice(0, 5).map((d, i) => {
        if (d.holiday) {
            return { label: d.label, zuc: 0, tp: 0, delta: 0, status: 'skip', isToday: false };
        }
        const zuc   = d.zucHours;
        const tp    = +ts.totalsRow.tp[i].toFixed(1);
        const delta = +(zuc - tp).toFixed(1);

        const today   = picker.pickerToday;
        const dayDate = ts.weekData?.days[i]?.date;
        const isToday = !!dayDate && new Date(dayDate).toDateString() === today.toDateString();

        if (zuc === 0 && tp === 0) return { label: d.label, zuc, tp, delta: 0, status: 'skip', isToday };
        if (delta === 0)           return { label: d.label, zuc, tp, delta: 0, status: 'ok',   isToday };
        if (tp === 0)              return { label: d.label, zuc, tp, delta,    status: 'err',  isToday };
        if (delta < 0)             return { label: d.label, zuc, tp, delta,    status: 'over', isToday };
        return                            { label: d.label, zuc, tp, delta,    status: 'warn', isToday };
    })
);

const totalZuc   = computed(() => +ts.days.slice(0,5).reduce((a, d) => a + d.zucHours, 0).toFixed(1));
const totalTp    = computed(() => +ts.totalsRow.tp.slice(0,5).reduce((a, b) => a + b, 0).toFixed(1));
const totalDelta = computed(() => +(totalZuc.value - totalTp.value).toFixed(1));

const pendingEditsCount = computed(() =>
    Object.values(ts.hoursEdits).filter(h => h > 0).length
);
</script>
