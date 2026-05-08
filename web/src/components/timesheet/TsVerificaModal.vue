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
                        <th class="text-center">TP ora</th>
                        <th class="text-center">Da inviare</th>
                        <th class="text-center">Delta</th>
                        <th class="text-center">Stato</th>
                    </tr>
                </thead>
                <tbody>
                    <tr v-for="row in verificaRows" :key="row.label" class="text-xs">
                        <td :class="row.isToday ? 'font-bold text-primary' : ''">{{ row.label }}</td>
                        <td class="text-center">{{ row.zuc > 0 ? row.zuc + 'h' : '—' }}</td>
                        <td class="text-center" :class="row.server !== row.tp ? 'text-warning/70' : ''">{{ row.server > 0 ? row.server + 'h' : '—' }}</td>
                        <td class="text-center font-medium">{{ row.tp > 0 ? row.tp + 'h' : '—' }}</td>
                        <td class="text-center" :class="getDeltaHoursCls(row.delta)">
                            {{ formatDeltaHours(row.status === 'skip' ? null : row.delta) }}
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
                        <td class="text-center">{{ ts.zucWorkdayTotal }}h</td>
                        <td class="text-center">{{ serverWorkdayTotal }}h</td>
                        <td class="text-center">{{ ts.tpWorkdayTotal }}h</td>
                        <td class="text-center" :class="getDeltaHoursCls(ts.workdayDeltaTotal)">
                            {{ formatDeltaHours(ts.workdayDeltaTotal) }}
                        </td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
            <div v-if="deletePending.length > 0" class="alert alert-error text-xs p-2 mb-3">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                </svg>
                <span>
                    Attenzione: {{ deletePending.length }} entr{{ deletePending.length === 1 ? 'y verrà cancellata' : 'y verranno cancellate' }} da TP (ore → 0):
                    <strong>{{ deletePending.map(e => e.usName).join(', ') }}</strong>
                </span>
            </div>
            <div v-if="ts.pendingSubmissions.length > 0" class="alert alert-info text-xs p-2 mb-3">
                <svg class="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                </svg>
                <span>Hai {{ ts.pendingSubmissions.length }} ore modificate non ancora inviate a TP.</span>
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
import { formatDeltaHours, getDeltaHoursCls } from '../../utils';

defineProps<{ open: boolean }>();
defineEmits<{ (e: 'close'): void }>();

const ts     = useTimesheetStore();

interface VerificaRow {
    label:   string;
    zuc:     number;
    server:  number;
    tp:      number;
    delta:   number;
    status:  'ok' | 'warn' | 'err' | 'over' | 'skip';
    isToday: boolean;
}

const verificaRows = computed<VerificaRow[]>(() =>
    ts.days.slice(0, 5).map((d, i) => {
        if (d.holiday) {
            return { label: d.label, zuc: 0, server: 0, tp: 0, delta: 0, status: 'skip', isToday: false };
        }
        const zuc    = d.zucHours;
        const server = ts.serverTotalsRow[i];
        const tp     = +ts.totalsRow.tp[i].toFixed(1);
        const delta  = +(zuc - tp).toFixed(1);
        const isToday = ts.getDayColCls(i).includes('today-col');

        if (zuc === 0 && tp === 0) return { label: d.label, zuc, server, tp, delta: 0, status: 'skip', isToday };
        if (delta === 0)           return { label: d.label, zuc, server, tp, delta: 0, status: 'ok',   isToday };
        if (tp === 0)              return { label: d.label, zuc, server, tp, delta,    status: 'err',  isToday };
        if (delta < 0)             return { label: d.label, zuc, server, tp, delta,    status: 'over', isToday };
        return                            { label: d.label, zuc, server, tp, delta,    status: 'warn', isToday };
    })
);

const serverWorkdayTotal = computed(() =>
    ts.serverTotalsRow.slice(0, 5).reduce((a, b) => a + b, 0)
);

const deletePending = computed(() => ts.pendingSubmissions.filter(e => e.isDelete));
</script>
