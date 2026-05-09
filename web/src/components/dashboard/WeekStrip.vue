<template>
    <div>
        <DayLocationPopover ref="popover" />
        <div
            class="bg-base-100 border border-base-300 rounded-xl p-3 mb-3 flex items-center gap-2 overflow-x-auto"
        >
            <button class="btn btn-ghost btn-xs btn-square shrink-0">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 19l-7-7 7-7"
                    />
                </svg>
            </button>
            <div class="flex gap-2 flex-1">
                <div
                    v-for="(card, i) in weekCards"
                    :key="i"
                    class="week-card flex-1"
                    :class="{
                        active: card.isSelected,
                        'outline outline-2 outline-offset-1 outline-primary/60 shadow-md':
                            card.isToday,
                        'rend-ok': card.rendStatus === 'ok',
                        'rend-warn': card.rendStatus === 'warn',
                        'rend-err': card.rendStatus === 'err',
                    }"
                    @click="
                        picker.selectDay(
                            card.date.getFullYear(),
                            card.date.getMonth(),
                            card.date.getDate(),
                        )
                    "
                >
                    <div class="flex items-center justify-between mb-1">
                        <span
                            class="text-xs font-bold"
                            :class="card.isSelected ? 'text-primary' : ''"
                            >{{ card.dateLabel }}</span
                        >
                        <span
                            class="text-xs font-bold"
                            :class="card.rendIconCls"
                            v-html="card.rendIcon"
                        ></span>
                    </div>
                    <div class="text-xs text-base-content/50">
                        <span class="text-success font-medium">{{ card.zucH }}h</span> Zuc
                        <span class="mx-1 text-base-content/20">·</span>
                        <span class="text-primary font-medium">{{ card.tpH }}h</span> TP
                    </div>
                    <div
                        v-if="card.badges.length > 0"
                        class="flex flex-wrap gap-0.5 mt-1 cursor-pointer"
                        @click.stop="popover?.open(i)"
                    >
                        <span
                            v-for="b in card.badges"
                            :key="b.emoji"
                            class="ts-badge"
                            :title="b.title"
                            >{{ b.emoji }}</span
                        >
                    </div>
                </div>
            </div>
            <button class="btn btn-ghost btn-xs btn-square shrink-0">
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5l7 7-7 7"
                    />
                </svg>
            </button>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { usePickerStore } from "../../stores/usePickerStore";
import { useTimesheetStore } from "../../stores/useTimesheetStore";
import { useDayStatus } from "../../composables/useDayStatus";
import {
    locationEmoji,
    locationTitle,
    giustActivityEmojis,
    rendStatusIcon,
    rendStatusIconCls,
} from "../../utils";
import type { ZucchettiJustification } from "@shared/zucchetti";
import DayLocationPopover from "../timesheet/DayLocationPopover.vue";

const picker = usePickerStore();
const ts = useTimesheetStore();
const { getStatus, getDayColCls } = useDayStatus();
const popover = ref<InstanceType<typeof DayLocationPopover> | null>(null);

const weekCards = computed(() => {
    const mondayStr = ts.currentMonday;
    if (!mondayStr) return [];
    const monday = new Date(mondayStr);

    return ts.days.slice(0, 5).map((d, i) => {
        const date = new Date(monday);
        date.setDate(monday.getDate() + i);
        const monAbbr = date.toLocaleDateString("it-IT", { month: "short" });
        const dateLabel = `${date.getDate()} ${monAbbr.charAt(0).toUpperCase() + monAbbr.slice(1, 3)}`;

        const colCls = getDayColCls(i);
        const isSelected = colCls.includes("selected-col");
        const isToday = colCls.includes("today-col");
        const tpH = ts.totalsRow.tp[i];

        const r = getStatus(i) ?? null;
        const rendIcon = rendStatusIcon(r) || "·";
        const rendIconCls = rendStatusIconCls(r) || "text-base-content/20";

        const giust: ZucchettiJustification[] =
            ts.weekData?.days[i]?.zucchetti?.giustificativi ?? [];
        const badges: { emoji: string; title: string }[] = [];
        if (d.location)
            badges.push({ emoji: locationEmoji(d.location), title: locationTitle(d.location) });
        for (const emoji of giustActivityEmojis(giust)) badges.push({ emoji, title: emoji });

        return {
            date,
            dateLabel,
            isSelected,
            isToday,
            rendStatus: r,
            rendIcon,
            rendIconCls,
            zucH: d.zucHours,
            tpH,
            nibol: d.nibol,
            badges,
        };
    });
});
</script>

