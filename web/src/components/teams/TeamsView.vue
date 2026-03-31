<template>
    <div>
        <div class="flex items-center gap-3 mb-4">
            <h2 class="text-base font-bold">Teams · Chat — {{ dateLabel }}</h2>
            <span class="badge badge-outline badge-sm">{{ day.teams.length }} messaggi</span>
        </div>

        <div v-if="day.teams.length === 0"
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
import { useDayStore }           from '../../stores/useDayStore';
import type { TeamsMessageRaw }  from '../../types';
import { getTimeString } from '@shared/dates';

const picker = usePickerStore();
const day    = useDayStore();

const dateLabel = ref('');

interface MessageGroup {
    chatId:   string;
    topic:    string | null;
    messages: TeamsMessageRaw[];
}

const groupedMessages = computed<MessageGroup[]>(() => {
    const map = new Map<string, MessageGroup>();
    for (const m of day.teams) {
        if (!map.has(m.chatId)) {
            map.set(m.chatId, { chatId: m.chatId, topic: m.chatTopic, messages: [] });
        }
        map.get(m.chatId)!.messages.push(m);
    }
    return [...map.values()].sort((a, b) => b.messages.length - a.messages.length);
});

function formatTime(iso: string): string {
    return getTimeString(iso).slice(0, 5);
}

function stripHtml(html: string): string {
    return html.replaceAll(/<[^>]*>/g, ' ').replaceAll(/\s+/g, ' ').trim();
}

function truncate(text: string, max: number): string {
    return text.length <= max ? text : text.slice(0, max) + '…';
}

watch(() => picker.pickerSelected, (d) => {
    dateLabel.value = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'short' });
}, { immediate: true });
</script>
