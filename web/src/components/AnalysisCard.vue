<template>
    <main class="analysis-card">
        <div class="card-header">
            <h2 class="panel-title">Proposta AI</h2>
            <div class="balance" :class="balanceOk ? 'balance-ok' : 'balance-warn'">
                {{ proposal.totalHours.toFixed(2) }}h / {{ proposal.oreTarget.toFixed(2) }}h
                <span v-if="!balanceOk">
                    ({{ hoursBalance > 0 ? '+' : '' }}{{ hoursBalance.toFixed(2) }}h)
                </span>
            </div>
        </div>

        <!-- Entries list -->
        <div class="entries">
            <div
                v-for="(entry, idx) in proposal.entries"
                :key="idx"
                class="entry-row"
                :class="{ 'entry-approved': entry.approved, 'entry-submitted': entry.submitted }"
            >
                <input
                    type="checkbox"
                    :checked="entry.approved"
                    :disabled="entry.submitted"
                    @change="toggleApproved(idx)"
                />
                <span class="entry-type" :class="`type-${entry.entityType}`">
                    {{ entry.entityType }}
                </span>
                <span class="entry-name" :title="entry.reasoning">
                    <template v-if="entry.taskId">#{{ entry.taskId }} </template>{{ entry.taskName }}
                </span>
                <input
                    type="number"
                    class="entry-hours"
                    :value="entry.inferredHours"
                    :disabled="entry.submitted"
                    step="0.25"
                    min="0"
                    @change="updateHours(idx, $event)"
                />
                <span class="confidence" :class="`conf-${entry.confidence}`">{{ entry.confidence[0] }}</span>
            </div>
        </div>

        <!-- Hook buttons: Zucchetti & Nibol -->
        <div class="hooks-section">
            <span class="hooks-label">Zucchetti</span>
            <button class="btn-hook" @click="$emit('hook', 'zucchetti', 'fullDaySw')">SW full</button>
            <button class="btn-hook" @click="$emit('hook', 'zucchetti', 'halfDaySw')">½ SW</button>
            <button class="btn-hook" @click="$emit('hook', 'zucchetti', 'halfDayLeave')">½ Ferie</button>
        </div>
        <div class="hooks-section">
            <span class="hooks-label">Nibol</span>
            <button class="btn-hook" @click="$emit('hook', 'nibol', 'bookDesk')">Prenota</button>
            <button class="btn-hook" @click="$emit('hook', 'nibol', 'checkIn')">Check-in</button>
        </div>

        <!-- Actions -->
        <div class="card-footer">
            <button class="btn-primary" :disabled="submitting || !hasApproved" @click="$emit('submit')">
                <template v-if="submitting">Invio...</template>
                <template v-else>Conferma e invia ✓</template>
            </button>
        </div>
    </main>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import type { DayProposal, ProposalEntry } from '../types';

const props = defineProps<{
    proposal:     DayProposal;
    balanceOk:    boolean;
    hoursBalance: number;
    submitting:   boolean;
    selectedDate: string;
}>();

const emit = defineEmits<{
    (e: 'patch', patch: Partial<DayProposal>): void;
    (e: 'submit'): void;
    (e: 'hook', type: 'zucchetti' | 'nibol', action: string): void;
}>();

const hasApproved = computed(() => props.proposal.entries.some(e => e.approved && !e.submitted));

function toggleApproved(idx: number): void {
    const entries = props.proposal.entries.map((e, i) =>
        i === idx ? { ...e, approved: !e.approved } : e
    );
    emit('patch', { entries });
}

function updateHours(idx: number, event: Event): void {
    const val     = parseFloat((event.target as HTMLInputElement).value);
    if (isNaN(val) || val < 0) return;
    const entries = props.proposal.entries.map((e: ProposalEntry, i: number) =>
        i === idx ? { ...e, inferredHours: val } : e
    );
    const total = entries.reduce((s: number, e: ProposalEntry) => s + e.inferredHours, 0);
    emit('patch', { entries, totalHours: Math.round(total * 100) / 100 });
}
</script>

<style scoped>
.analysis-card {
    display:       flex;
    flex-direction: column;
    padding:       0.75rem 1rem;
    overflow-y:    auto;
    border-right:  1px solid #2e3148;
}
.card-header {
    display:     flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.75rem;
}
.panel-title { margin: 0; font-size: 0.85rem; color: #7c85f5; text-transform: uppercase; letter-spacing: 0.05em; }

.balance { font-size: 0.9rem; font-weight: 700; }
.balance-ok   { color: #7ecf7e; }
.balance-warn { color: #ff9966; }

.entries { flex: 1; display: flex; flex-direction: column; gap: 0.4rem; }

.entry-row {
    display:     grid;
    grid-template-columns: 18px 80px 1fr 60px 18px;
    align-items: center;
    gap:         0.5rem;
    padding:     0.4rem 0.5rem;
    background:  #1a1d27;
    border-radius: 4px;
    border-left: 3px solid transparent;
}
.entry-approved  { border-left-color: #7ecf7e; }
.entry-submitted { opacity: 0.6; }

.entry-type {
    font-size:   0.7rem;
    font-weight: 700;
    padding:     0.1rem 0.3rem;
    border-radius: 3px;
    text-align:  center;
    text-transform: uppercase;
}
.type-UserStory { background: #1e3a5f; color: #64b5f6; }
.type-Task      { background: #2d4a2d; color: #81c784; }
.type-Bug       { background: #4a1e1e; color: #e57373; }
.type-recurring { background: #3a3a1e; color: #fff176; }

.entry-name {
    font-size:   0.82rem;
    overflow:    hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor:      help;
}
.entry-hours {
    width:      100%;
    background: #2a2d3e;
    border:     1px solid #3e4166;
    border-radius: 3px;
    color:      #e0e0e0;
    text-align: right;
    padding:    0.15rem 0.3rem;
    font-size:  0.82rem;
}
.confidence {
    font-size:   0.7rem;
    font-weight: 700;
    text-align:  center;
}
.conf-high   { color: #7ecf7e; }
.conf-medium { color: #fff176; }
.conf-low    { color: #ff9966; }

.hooks-section {
    display:    flex;
    gap:        0.4rem;
    align-items: center;
    margin-top: 0.75rem;
    flex-wrap:  wrap;
}
.hooks-label { font-size: 0.75rem; color: #888; min-width: 55px; }
.btn-hook {
    font-size:    0.75rem;
    padding:      0.2rem 0.5rem;
    background:   #2a2d3e;
    border:       1px solid #3e4166;
    border-radius: 4px;
    color:        #ccc;
    cursor:       pointer;
}
.btn-hook:hover { background: #3e4166; }

.card-footer { margin-top: 1rem; }
.btn-primary {
    width:      100%;
    padding:    0.5rem;
    background: #3d47b5;
    border:     none;
    border-radius: 6px;
    color:      #fff;
    font-weight: 700;
    cursor:     pointer;
    font-size:  0.9rem;
}
.btn-primary:hover:not(:disabled) { background: #4e5ac8; }
.btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
