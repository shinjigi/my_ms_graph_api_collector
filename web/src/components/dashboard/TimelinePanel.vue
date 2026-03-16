<template>
    <div class="card bg-base-100 border border-base-300 shadow-sm">
        <div class="card-body p-3">
            <div class="text-xs font-bold text-base-content/50 uppercase mb-2 px-1">Timeline</div>
            <div class="relative" :style="{ height: containerH + 'px' }">
                <!-- Hour lines -->
                <div
                    v-for="h in hourRange"
                    :key="h"
                    class="timeline-hour"
                    :style="{ position:'absolute', left:0, right:0, height:'60px', top: (h - startHour) * 60 + 'px' }"
                >
                    <span class="timeline-label">{{ h }}:00</span>
                </div>
                <!-- Now line -->
                <div class="timeline-now" :style="{ top: nowTop + 'px' }" v-if="nowTop >= 0"></div>
                <!-- Events -->
                <div
                    v-for="(ev, idx) in tlEvents"
                    :key="idx"
                    class="tl-event"
                    :class="[typeClass(ev.type), ev.corrUs ? 'tl-event-corr' : '']"
                    :style="{ top: (evMins(ev) - startMin) + 'px', height: Math.max(ev.h, 16) + 'px' }"
                    :title="ev.corrUs ? 'Correlato → ' + ev.corrUs : undefined"
                    @click="ev.emailId != null ? ui.openEmail(ev.emailId) : undefined"
                    @pointerenter="ev.corrUs ? $emit('highlightUs', ev.corrUs) : undefined"
                    @pointerleave="$emit('clearHighlight')"
                >
                    <span class="font-medium">{{ ev.time }}</span>
                    {{ evIcon(ev.type) }}
                    <span class="truncate">{{ ev.label }}</span>
                </div>
            </div>
            <div class="flex flex-wrap gap-2 mt-2 pt-2 border-t border-base-300 text-xs text-base-content/40">
                <span class="flex items-center gap-1"><span style="width:3px;height:10px;background:#0ea5e9;border-radius:2px;display:inline-block"></span>Meeting</span>
                <span class="flex items-center gap-1"><span style="width:3px;height:10px;background:#6366f1;border-radius:2px;display:inline-block"></span>Git</span>
                <span class="flex items-center gap-1"><span style="width:3px;height:10px;background:#f59e0b;border-radius:2px;display:inline-block"></span>SVN</span>
                <span class="flex items-center gap-1"><span style="width:3px;height:10px;background:#10b981;border-radius:2px;display:inline-block"></span>Email</span>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed }    from 'vue';
import { useDayStore } from '../../stores/useDayStore';
import { useUiStore }  from '../../stores/useUiStore';
import type { TlEvent } from '../../types';

defineEmits<{ highlightUs: [us: string]; clearHighlight: [] }>();

const day = useDayStore();
const ui  = useUiStore();

const tlEvents = computed(() => day.tlEvents);

function evMins(ev: TlEvent) {
    const [h, m] = ev.time.split(':').map(Number);
    return h * 60 + m;
}

const startMin = computed(() => {
    const starts = tlEvents.value.map(evMins);
    return Math.floor((Math.min(...starts) - 45) / 60) * 60;
});
const endMin = computed(() => {
    const ends = tlEvents.value.map((ev) => evMins(ev) + (ev.h || 18));
    return Math.ceil((Math.max(...ends) + 45) / 60) * 60;
});
const startHour  = computed(() => startMin.value  / 60);
const endHour    = computed(() => endMin.value    / 60);
const containerH = computed(() => (endHour.value - startHour.value) * 60);
const hourRange  = computed(() => {
    const arr: number[] = [];
    for (let h = startHour.value; h <= endHour.value; h++) arr.push(h);
    return arr;
});
const nowTop = computed(() => {
    const nowMins = 17 * 60 + 20;
    return (nowMins >= startMin.value && nowMins <= endMin.value)
        ? nowMins - startMin.value
        : -1;
});

const TYPE_CLASS: Record<string, string> = {
    meeting:    'tl-event-meeting',
    commit:     'tl-event-commit',
    svn:        'tl-event-svn',
    'email-in': 'tl-event-email-in',
    'email-out':'tl-event-email-out',
};
function typeClass(t: string) { return TYPE_CLASS[t] ?? 'tl-event-commit'; }
function evIcon(t: string) {
    return { meeting:'📅', commit:'💻', svn:'💾', 'email-in':'📧', 'email-out':'📤' }[t] ?? '·';
}
</script>
