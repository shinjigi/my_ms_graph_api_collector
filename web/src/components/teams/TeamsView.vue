<template>
    <div>
        <div class="flex items-center gap-3 mb-4">
            <h2 class="text-base font-bold">Teams · Chat — {{ dateLabel }}</h2>
            <span class="badge badge-outline badge-sm">{{ totalMessages }} messaggi</span>
        </div>

        <div v-if="day.teams.length === 0" class="text-center py-12 text-base-content/30 text-sm">
            Nessun messaggio Teams registrato per questo giorno.
        </div>

        <div v-else class="space-y-3">
            <!-- Group by chat topic -->
            <div
                v-for="group in day.teams"
                :key="group.chatId"
                class="card bg-base-100 border border-base-300 shadow-sm"
            >
                <div class="card-body p-3">
                    <div class="flex items-center gap-2 mb-2">
                        <span class="text-sm font-semibold text-base-content/70 truncate">
                            💬 {{ group.chatTopic ?? "Chat diretta" }}
                        </span>
                        <span class="badge badge-xs badge-ghost ml-auto shrink-0">{{
                            group.messages.length
                        }}</span>
                    </div>
                    <div class="space-y-2">
                        <div v-for="m in group.messages" :key="m.id" class="flex items-start gap-2">
                            <div
                                class="w-1 h-full rounded-full bg-accent/40 shrink-0 mt-1"
                                style="min-height: 16px"
                            ></div>
                            <div class="min-w-0 flex-1">
                                <div class="flex items-baseline gap-2 mb-0.5">
                                    <span class="text-xs text-base-content/40">{{
                                        getTimeStringNoSeconds(m.createdDateTime ?? "")
                                    }}</span>
                                    <span class="text-xs font-medium text-accent/70">{{ m.from ?? "?" }}</span>
                                    <a
                                        v-if="m.webUrl"
                                        :href="m.webUrl"
                                        target="_blank"
                                        class="text-xs text-primary hover:underline ml-auto shrink-0"
                                        >→ Teams</a
                                    >
                                </div>
                                <div
                                    class="text-xs text-base-content/70 break-words line-clamp-3"
                                    :title="m.body"
                                >
                                    {{ truncate(m.body, 200) }}
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
import { ref, computed, watch } from "vue";
import { usePickerStore } from "../../stores/usePickerStore";
import { useDayStore } from "../../stores/useDayStore";
import type { TeamsChatData, TeamsChatMessage } from "../../types";
import { getTimeStringNoSeconds } from "@shared/dates";

const picker = usePickerStore();
const day = useDayStore();

const dateLabel = ref("");

const totalMessages = computed<number>(() =>
    day.teams.reduce((s, c) => s + c.messages.length, 0),
);

function truncate(text: string, max: number): string {
    return text.length <= max ? text : text.slice(0, max) + "…";
}

watch(
    () => picker.pickerSelected,
    (d) => {
        dateLabel.value = d.toLocaleDateString("it-IT", {
            weekday: "long",
            day: "numeric",
            month: "short",
        });
    },
    { immediate: true },
);
</script>
