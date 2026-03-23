<template>
    <div>
        <div class="flex items-center gap-3 mb-4">
            <h2 class="text-base font-bold">Browser — {{ dateLabel }}</h2>
            <span class="badge badge-outline badge-sm">{{ data?.totalVisits ?? 0 }} visite</span>
            <span class="badge badge-outline badge-sm">{{ data?.totalDomains ?? 0 }} domini</span>
        </div>

        <div v-if="loading" class="flex items-center gap-2 py-8 justify-center text-base-content/40">
            <span class="loading loading-spinner loading-sm"></span>
            <span class="text-xs">Caricamento cronologia browser…</span>
        </div>

        <div v-else-if="error" class="alert alert-error text-sm">{{ error }}</div>

        <div v-else-if="!data || data.totalVisits === 0"
             class="text-center py-12 text-base-content/30 text-sm">
            Nessuna visita browser registrata per questo giorno.
        </div>

        <div v-else class="grid grid-cols-2 gap-3">
            <!-- Top domains -->
            <div class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body p-3">
                    <div class="text-xs font-bold text-base-content/50 uppercase tracking-wide mb-3">Top domini</div>
                    <div class="space-y-2">
                        <div v-for="d in data.byDomain" :key="d.domain">
                            <div class="flex justify-between text-xs mb-0.5">
                                <span class="font-mono truncate text-base-content/70 max-w-[180px]" :title="d.domain">{{ d.domain }}</span>
                                <span class="shrink-0 ml-2 font-semibold text-base-content/60">{{ d.visits }}</span>
                            </div>
                            <div class="h-1 rounded-sm bg-base-300 overflow-hidden">
                                <div class="h-full rounded-sm bg-info/60" :style="{ width: d.pct + '%' }"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Visit list -->
            <div class="card bg-base-100 border border-base-300 shadow-sm overflow-y-auto" style="max-height: 620px;">
                <div class="card-body p-3">
                    <div class="flex items-center justify-between mb-3">
                        <div class="text-xs font-bold text-base-content/50 uppercase tracking-wide">Cronologia</div>
                        <input
                            type="text"
                            placeholder="Filtra URL o titolo…"
                            class="input input-xs h-6 text-xs w-40"
                            v-model="search"
                        >
                    </div>
                    <div class="space-y-1">
                        <div v-for="v in filteredVisits" :key="v.visitId"
                             class="flex items-start gap-2 py-1 border-b border-base-200/50 last:border-0">
                            <span class="text-xs text-base-content/30 shrink-0 tabular-nums w-10">{{ formatTime(v.visitTime) }}</span>
                            <div class="min-w-0 flex-1">
                                <div v-if="v.title" class="text-xs text-base-content/70 truncate" :title="v.title">{{ v.title }}</div>
                                <div class="text-xs font-mono text-base-content/30 truncate" :title="v.url">{{ v.url }}</div>
                            </div>
                        </div>
                    </div>
                    <div v-if="filteredVisits.length === 0 && search" class="text-xs text-base-content/30 text-center py-4">
                        Nessun risultato per "{{ search }}"
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch }   from 'vue';
import { usePickerStore }         from '../../stores/usePickerStore';
import { fetchDayBrowser }        from '../../api';
import type { BrowserResponse }   from '../../api';

const picker = usePickerStore();

const loading = ref(false);
const error   = ref('');
const data    = ref<BrowserResponse | null>(null);
const search  = ref('');

const dateLabel = ref('');

const filteredVisits = computed(() => {
    if (!data.value) return [];
    const needle = search.value.trim().toLowerCase();
    if (!needle) return data.value.visits;
    return data.value.visits.filter(v =>
        v.url.toLowerCase().includes(needle) ||
        (v.title ?? '').toLowerCase().includes(needle)
    );
});

function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

async function load(date: string) {
    loading.value = true;
    error.value   = '';
    search.value  = '';
    try {
        data.value = await fetchDayBrowser(date);
    } catch (e) {
        error.value = (e as Error).message;
        data.value  = null;
    } finally {
        loading.value = false;
    }
}

watch(() => picker.pickerSelected, (d) => {
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    dateLabel.value = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
    load(`${yr}-${mo}-${dd}`);
}, { immediate: true });
</script>
