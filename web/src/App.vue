<template>
    <div class="app">
        <header class="app-header">
            <h1>TP Automation</h1>
            <div class="date-nav">
                <select v-model="selectedDate" @change="fetchDay(selectedDate)">
                    <option v-for="d in dates" :key="d" :value="d">{{ d }}</option>
                </select>
                <button @click="fetchDates" :disabled="loading" class="btn-icon">↻</button>
            </div>
            <span v-if="error" class="badge-error">{{ error }}</span>
        </header>

        <div v-if="loading" class="loading">Caricamento...</div>

        <div v-else-if="proposal" class="layout-3col">
            <CalendarPanel :signals="signals" />
            <AnalysisCard
                :proposal="proposal"
                :balance-ok="balanceOk"
                :hours-balance="hoursBalance"
                :submitting="submitting"
                :selected-date="selectedDate"
                @patch="patchProposal"
                @submit="handleSubmit"
                @hook="runHook"
            />
            <TaskPanel
                :items="tpItems"
                :proposal="proposal"
                @patch="patchProposal"
            />
        </div>

        <div v-else class="empty-state">
            <p>Nessuna proposta disponibile.</p>
            <p>Esegui <code>npm run collect && npm run aggregate && npm run analyze</code></p>
        </div>
    </div>
</template>

<script setup lang="ts">
import { onMounted }    from 'vue';
import { useProposals } from './composables/useProposals';
import CalendarPanel    from './components/CalendarPanel.vue';
import AnalysisCard     from './components/AnalysisCard.vue';
import TaskPanel        from './components/TaskPanel.vue';
import type { DayProposal } from './types';

const {
    dates, selectedDate, proposal, signals, tpItems,
    loading, submitting, error, hoursBalance, balanceOk,
    fetchDates, fetchDay, patchProposal, submitDay, fetchTpItems, runHook,
} = useProposals();

onMounted(async () => {
    await fetchDates();
    await fetchTpItems();
});

async function handleSubmit(): Promise<void> {
    const result = await submitDay();
    if (result.submitted > 0) {
        alert(`Inviate ${result.submitted} entries a TargetProcess.`);
    }
    if (result.errors.length > 0) {
        alert(`Errori: ${JSON.stringify(result.errors)}`);
    }
}
</script>

<style scoped>
.app { display: flex; flex-direction: column; height: 100vh; }

.app-header {
    display:         flex;
    align-items:     center;
    gap:             1rem;
    padding:         0.6rem 1.2rem;
    background:      #1a1d27;
    border-bottom:   1px solid #2e3148;
}
.app-header h1 { margin: 0; font-size: 1.1rem; color: #7c85f5; }

.date-nav { display: flex; gap: 0.4rem; align-items: center; }
.date-nav select {
    background:  #2a2d3e;
    color:       #e0e0e0;
    border:      1px solid #3e4166;
    border-radius: 4px;
    padding:     0.25rem 0.5rem;
}
.btn-icon { background: none; border: none; color: #7c85f5; cursor: pointer; font-size: 1rem; }

.badge-error { color: #ff6b6b; font-size: 0.85rem; }
.loading { padding: 2rem; text-align: center; color: #888; }
.empty-state { padding: 2rem; text-align: center; color: #888; }
.empty-state code { background: #2a2d3e; padding: 0.2rem 0.4rem; border-radius: 3px; }

.layout-3col {
    display:     grid;
    grid-template-columns: 240px 1fr 260px;
    flex:        1;
    overflow:    hidden;
}
</style>
