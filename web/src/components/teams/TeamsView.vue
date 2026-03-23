<template>
    <div>
        <div class="flex items-center gap-3 mb-4">
            <h2 class="text-base font-bold">Teams · Chat — {{ dateLabel }}</h2>
            <span class="badge badge-outline badge-sm">{{ data?.messages.length ?? 0 }} messaggi</span>
        </div>

        <div v-if="loading" class="flex items-center gap-2 py-8 justify-center text-base-content/40">
            <span class="loading loading-spinner loading-sm"></span>
            <span class="text-xs">Caricamento messaggi Teams…</span>
        </div>

        <div v-else-if="error" class="alert alert-error text-sm">{{ error }}</div>

        <div v-else-if="!data || data.messages.length === 0"
             class="text-center py-12 text-base-content/30 text-sm">
            Nessun messaggio Teams registrato per questo giorno.
        </div>

        <div v-else class="space-y-3">
            <!-- Group by chat topic -->
            <div v-for="group in groupedMessages" :key="group.chatId" class="card bg-base-100 border border-base-300 shadow-sm">
                <div class="card-body p-3">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-sm font-semibold text-base-content/70 truncate">
                            💬 {{ group.topic ?? 'Chat diretta' }}
                        </span>
                        <span class="badge badge-xs badge-ghost ml-auto shrink-0">{{ group.messages.length }}</span>
                    </div>
                    <div class="space-y-2">
                        <div v-for="m in group.messages" :key="m.id" class="flex items-start gap-2">
                            <div class="w-1 h-full rounded-full bg-accent/40 shrink-0 mt-1" style="min-height:16px"></div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-baseline gap-2 mb-0.5">
                                    <span class="text-xs text-base-content/40">{{ formatTime(m.createdDateTime) }}</span>
                                    <a v-if="m.webUrl" :href="m.webUrl" target="_blank"
                                       class="text-xs text-primary hover:underline ml-auto shrink-0">→ Teams</a>
                                </div>
                                <div class="text-xs text-base-content/70 break-words line-clamp-3"
                                     :title="stripHtml(m.body.content)">
                                    {{ truncate(stripHtml(m.body.content), 200) }}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { ref, computed, watch }  from 'vue';
import { usePickerStore }        from '../../stores/usePickerStore';
import { fetchDayTeams }         from '../../api';
import type { TeamsResponse, TeamsMessage } from '../../api';

const picker = usePickerStore();

const loading = ref(false);
const error   = ref('');
const data    = ref<TeamsResponse | null>(null);

const dateLabel = ref('');

interface MessageGroup {
    chatId:   string;
    topic:    string | null;
    messages: TeamsMessage[];
}

const groupedMessages = computed<MessageGroup[]>(() => {
    if (!data.value) return [];
    const map = new Map<string, MessageGroup>();
    for (const m of data.value.messages) {
        if (!map.has(m.chatId)) {
            map.set(m.chatId, { chatId: m.chatId, topic: m.chatTopic, messages: [] });
        }
        map.get(m.chatId)!.messages.push(m);
    }
    return [...map.values()].sort((a, b) => b.messages.length - a.messages.length);
});

function formatTime(iso: string): string {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
    return text.length <= max ? text : text.slice(0, max) + '…';
}

async function load(date: string) {
    loading.value = true;
    error.value   = '';
    try {
        data.value = await fetchDayTeams(date);
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
