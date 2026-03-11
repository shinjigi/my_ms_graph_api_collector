<template>
    <aside class="task-panel">
        <h2 class="panel-title">US / Task attivi</h2>

        <!-- Search bar -->
        <div class="search-bar">
            <input
                v-model="searchQuery"
                placeholder="Cerca per ID o parola chiave..."
                @input="onSearch"
            />
        </div>

        <!-- Search results (if any) -->
        <div v-if="searchResults.length > 0" class="search-results">
            <div
                v-for="item in searchResults"
                :key="item.id"
                class="search-item"
                @click="addItemToProposal(item)"
            >
                <span class="item-type" :class="`type-${item.entityType}`">{{ item.entityType[0] }}</span>
                <span class="item-id">#{{ item.id }}</span>
                <span class="item-name">{{ item.name }}</span>
            </div>
        </div>

        <!-- Active items list -->
        <div class="items-list">
            <div
                v-for="item in items"
                :key="item.id"
                class="item-row"
            >
                <span class="item-type" :class="`type-${item.entityType}`">{{ item.entityType[0] }}</span>
                <div class="item-info">
                    <span class="item-id">#{{ item.id }}</span>
                    <span class="item-name" :title="item.parentName ?? ''">{{ item.name }}</span>
                    <span class="item-project">{{ item.projectName }}</span>
                </div>
                <span class="item-spent" :title="`${item.timeSpent}h logged total`">
                    {{ item.timeSpent.toFixed(1) }}h
                </span>
            </div>
        </div>

        <div v-if="items.length === 0" class="empty">Nessun task attivo</div>
    </aside>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import type { TpOpenItem, DayProposal } from '../types';

const props = defineProps<{
    items:    TpOpenItem[];
    proposal: DayProposal;
}>();

const emit = defineEmits<{
    (e: 'patch', patch: Partial<DayProposal>): void;
}>();

const searchQuery   = ref('');
const searchResults = ref<TpOpenItem[]>([]);
let   searchTimer: ReturnType<typeof setTimeout> | null = null;

async function onSearch(): Promise<void> {
    if (searchTimer) clearTimeout(searchTimer);
    const q = searchQuery.value.trim();

    if (q.length < 2) {
        searchResults.value = [];
        return;
    }

    searchTimer = setTimeout(async () => {
        try {
            const res            = await fetch(`/api/hooks/tp-search?q=${encodeURIComponent(q)}`);
            searchResults.value  = await res.json() as TpOpenItem[];
        } catch {
            searchResults.value = [];
        }
    }, 350);
}

function addItemToProposal(item: TpOpenItem): void {
    // Add 0.5h placeholder entry for the selected item
    const already = props.proposal.entries.some(e => e.taskId === item.id);
    if (already) return;

    const entries = [
        ...props.proposal.entries,
        {
            taskId:        item.id,
            entityType:    item.entityType,
            taskName:      item.name,
            inferredHours: 0.5,
            confidence:    'low' as const,
            reasoning:     'Aggiunto manualmente',
            approved:      false,
        },
    ];

    emit('patch', { entries });
    searchQuery.value   = '';
    searchResults.value = [];
}
</script>

<style scoped>
.task-panel {
    background: #141620;
    overflow-y: auto;
    padding:    0.75rem;
    display:    flex;
    flex-direction: column;
    gap:        0.5rem;
}
.panel-title { margin: 0; font-size: 0.85rem; color: #7c85f5; text-transform: uppercase; letter-spacing: 0.05em; }

.search-bar input {
    width:        100%;
    background:   #2a2d3e;
    border:       1px solid #3e4166;
    border-radius: 4px;
    color:        #e0e0e0;
    padding:      0.3rem 0.5rem;
    font-size:    0.82rem;
}
.search-bar input::placeholder { color: #666; }

.search-results {
    background:    #1e2030;
    border:        1px solid #3e4166;
    border-radius: 4px;
    max-height:    160px;
    overflow-y:    auto;
}
.search-item {
    display:     flex;
    align-items: center;
    gap:         0.4rem;
    padding:     0.3rem 0.5rem;
    cursor:      pointer;
    font-size:   0.8rem;
}
.search-item:hover { background: #2a2d3e; }

.items-list { display: flex; flex-direction: column; gap: 0.35rem; flex: 1; }

.item-row {
    display:     flex;
    align-items: center;
    gap:         0.4rem;
    padding:     0.3rem 0.4rem;
    background:  #1a1d27;
    border-radius: 4px;
}
.item-type {
    font-size:   0.7rem;
    font-weight: 700;
    padding:     0.15rem 0.3rem;
    border-radius: 3px;
    flex-shrink: 0;
}
.type-UserStory { background: #1e3a5f; color: #64b5f6; }
.type-Task      { background: #2d4a2d; color: #81c784; }
.type-Bug       { background: #4a1e1e; color: #e57373; }

.item-info {
    flex:        1;
    display:     flex;
    flex-direction: column;
    overflow:    hidden;
    min-width:   0;
}
.item-id      { font-size: 0.72rem; color: #7c85f5; }
.item-name    { font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.item-project { font-size: 0.7rem; color: #666; }

.item-spent  { font-size: 0.75rem; color: #888; flex-shrink: 0; }
.empty       { color: #666; font-size: 0.8rem; }
</style>
