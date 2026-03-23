<template>
    <div>
        <div class="flex items-center gap-3 mb-4">
            <h2 class="text-base font-bold">Commit — {{ dateLabel }}</h2>
            <span class="badge badge-outline badge-sm">
                <span class="commit-dot source-git mr-1"></span>{{ data?.gitCommits.length ?? 0 }} Git
            </span>
            <span class="badge badge-outline badge-sm">
                <span class="commit-dot source-svn mr-1"></span>{{ data?.svnCommits.length ?? 0 }} SVN
            </span>
        </div>

        <div v-if="loading" class="flex items-center gap-2 py-8 justify-center text-base-content/40">
            <span class="loading loading-spinner loading-sm"></span>
            <span class="text-xs">Caricamento commit…</span>
        </div>

        <div v-else-if="error" class="alert alert-error text-sm">{{ error }}</div>

        <div v-else-if="!data || (data.gitCommits.length === 0 && data.svnCommits.length === 0)"
             class="text-center py-12 text-base-content/30 text-sm">
            Nessun commit registrato per questo giorno.
        </div>

        <div v-else class="space-y-3">
            <!-- Git commits -->
            <template v-if="data.gitCommits.length > 0">
                <div class="text-xs font-bold text-base-content/50 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                    <span class="commit-dot source-git"></span> Git ({{ data.gitCommits.length }})
                </div>
                <div class="card bg-base-100 border border-base-300 shadow-sm">
                    <div class="divide-y divide-base-200">
                        <div v-for="c in data.gitCommits" :key="c.hash" class="p-3 flex items-start gap-3">
                            <span class="commit-dot source-git mt-1.5 shrink-0"></span>
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-medium text-base-content/80 break-words">{{ firstLine(c.message) }}</div>
                                <div v-if="restOfMessage(c.message)" class="text-xs text-base-content/40 mt-0.5 whitespace-pre-wrap">{{ restOfMessage(c.message) }}</div>
                                <div class="flex items-center gap-2 mt-1 text-xs text-base-content/35 flex-wrap">
                                    <span class="font-mono text-base-content/25">{{ c.hash.slice(0, 8) }}</span>
                                    <span class="font-semibold text-base-content/50">{{ c.repo }}</span>
                                    <span>{{ c.author }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </template>

            <!-- SVN commits -->
            <template v-if="data.svnCommits.length > 0">
                <div class="text-xs font-bold text-base-content/50 uppercase tracking-wide mb-1 mt-4 flex items-center gap-1.5">
                    <span class="commit-dot source-svn"></span> SVN ({{ data.svnCommits.length }})
                </div>
                <div class="card bg-base-100 border border-base-300 shadow-sm">
                    <div class="divide-y divide-base-200">
                        <div v-for="c in data.svnCommits" :key="c.revision" class="p-3 flex items-start gap-3">
                            <span class="commit-dot source-svn mt-1.5 shrink-0"></span>
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-medium text-base-content/80 break-words">{{ firstLine(c.message) }}</div>
                                <div v-if="restOfMessage(c.message)" class="text-xs text-base-content/40 mt-0.5 whitespace-pre-wrap">{{ restOfMessage(c.message) }}</div>
                                <div class="flex items-center gap-2 mt-1 text-xs text-base-content/35 flex-wrap">
                                    <span class="font-mono text-base-content/25">r{{ c.revision }}</span>
                                    <span>{{ c.author }}</span>
                                    <div v-if="c.paths.length" class="text-base-content/25 truncate max-w-xs">
                                        {{ c.paths.slice(0, 3).join(' · ') }}{{ c.paths.length > 3 ? ` +${c.paths.length - 3}` : '' }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, watch }            from 'vue';
import { usePickerStore }        from '../../stores/usePickerStore';
import { fetchDayCommits }       from '../../api';
import type { CommitsResponse }  from '../../api';

const picker = usePickerStore();

const loading = ref(false);
const error   = ref('');
const data    = ref<CommitsResponse | null>(null);

const dateLabel = ref('');

function firstLine(msg: string)   { return msg.split('\n')[0]; }
function restOfMessage(msg: string) {
    const rest = msg.split('\n').slice(1).join('\n').trim();
    return rest || '';
}

async function load(date: string) {
    loading.value = true;
    error.value   = '';
    try {
        data.value = await fetchDayCommits(date);
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
    const dateStr = `${yr}-${mo}-${dd}`;
    dateLabel.value = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
    load(dateStr);
}, { immediate: true });
</script>
