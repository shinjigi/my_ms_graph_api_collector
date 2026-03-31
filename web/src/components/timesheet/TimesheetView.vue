<template>
    <div class="card bg-base-100 shadow-sm border border-base-300">
        <div class="card-body p-4">
            <TsToolbar @open-verifica="verificaOpen = true" />

            <TimesheetTable />

            <div class="mt-3 pt-2 border-t border-base-300 text-xs text-base-content/30 italic">
                Clicca intestazione giorno → vista dettaglio · Hover ore → ±0.5h · Click ore → input diretto
            </div>
        </div>
    </div>

    <TsVerificaModal :open="verificaOpen" @close="verificaOpen = false" />
</template>

<script setup lang="ts">
import { ref } from 'vue';
import TimesheetTable  from './TimesheetTable.vue';
import TsToolbar       from './TsToolbar.vue';
import TsVerificaModal from './TsVerificaModal.vue';

const verificaOpen = ref(false);
</script>
