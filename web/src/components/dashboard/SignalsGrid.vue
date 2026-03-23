<template>
    <div class="grid grid-cols-2 gap-3 content-start">
        <!-- Email -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3">
                <div class="text-xs font-bold text-base-content/50 uppercase mb-2">📧 Email</div>
                <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Ricevute</div><div class="font-bold text-base">{{ emailIn }}</div></div>
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Inviate</div><div class="font-bold text-base">{{ emailOut }}</div></div>
                </div>
                <div class="text-xs text-base-content/50 font-semibold mb-1">Per US</div>
                <div class="text-xs space-y-0.5">
                    <div v-for="g in emailByUs" :key="g.label" class="flex justify-between">
                        <span class="truncate" :class="g.isCorrelated ? 'text-base-content/70' : 'text-base-content/30'">{{ g.label }}</span>
                        <span class="font-bold shrink-0 ml-1" :class="g.isCorrelated ? 'text-primary' : ''">{{ g.count }}</span>
                    </div>
                </div>
            </div>
        </div>
        <!-- Teams -->
        <div class="card bg-base-100 border border-base-300 shadow-sm cursor-pointer hover:border-accent/50 transition-colors"
             @click="navigate('teams')">
            <div class="card-body p-3">
                <div class="text-xs font-bold text-base-content/50 uppercase mb-2">💬 Teams</div>
                <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Meeting</div><div class="font-bold text-base">{{ meetingCount }}</div></div>
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Messaggi</div><div class="font-bold text-base">{{ TEAMS_MSG_COUNT }}</div></div>
                </div>
                <div class="text-xs text-base-content/50 font-semibold mb-1">Meeting oggi</div>
                <div class="space-y-1 text-xs">
                    <div v-for="m in meetingEvents" :key="m.label" class="flex items-center gap-1.5">
                        <div style="width:3px;height:22px;background:#0ea5e9;border-radius:2px;flex-shrink:0"></div>
                        <div><div class="font-medium leading-tight">{{ m.label }}</div><div class="text-base-content/40">{{ m.time }}</div></div>
                    </div>
                </div>
                <div class="text-xs text-base-content/30 mt-2">Tempo meeting: <strong class="text-base-content/50">{{ meetingDuration }}</strong></div>
            </div>
        </div>
        <!-- Browser -->
        <div class="card bg-base-100 border border-base-300 shadow-sm hover:border-info/50 transition-colors">
            <div class="card-body p-3">
                <div class="flex items-center justify-between select-none cursor-pointer" @click="navigate('browser')">
                    <div class="text-xs font-bold text-base-content/50 uppercase">🌐 Browser</div>
                    <div class="flex items-center gap-1.5 text-xs text-base-content/35" @click.stop="ui.toggleBrowser()">
                        <span>{{ BROWSER_TOTAL_VISITS }} visite · {{ BROWSER_TOTAL_DOMAINS }} domini</span>
                        <svg class="w-3 h-3 transition-transform" :class="ui.browserExpanded ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </div>
                </div>
                <div v-if="ui.browserExpanded">
                    <div class="grid grid-cols-2 gap-1.5 text-xs mb-2 mt-2">
                        <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Visite</div><div class="font-bold text-base">{{ BROWSER_TOTAL_VISITS }}</div></div>
                        <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Domini</div><div class="font-bold text-base">{{ BROWSER_TOTAL_DOMAINS }}</div></div>
                    </div>
                    <div class="text-xs text-base-content/50 font-semibold mb-1">Top domini</div>
                    <div class="space-y-1.5 text-xs">
                        <div v-for="d in BROWSER_DOMAINS" :key="d.domain">
                            <div class="flex justify-between mb-0.5">
                                <span class="font-mono truncate text-base-content/70">{{ d.domain }}</span>
                                <span class="shrink-0 ml-1">{{ d.visits }}</span>
                            </div>
                            <div class="h-0.5 rounded-sm bg-primary" :style="{ width: d.pct + '%' }"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <!-- Git / SVN -->
        <div class="card bg-base-100 border border-base-300 shadow-sm cursor-pointer hover:border-secondary/50 transition-colors"
             @click="navigate('activity')">
            <div class="card-body p-3">
                <div class="text-xs font-bold text-base-content/50 uppercase mb-2">💻 Git · SVN</div>
                <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Git</div><div class="font-bold text-base" style="color:#6366f1">{{ gitCount }}</div></div>
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">SVN</div><div class="font-bold text-base" style="color:#f59e0b">{{ svnCount }}</div></div>
                </div>
                <div class="text-xs text-base-content/50 font-semibold mb-1">Commit oggi</div>
                <div class="space-y-1 text-xs">
                    <div v-for="c in commitEvents" :key="c.label" class="flex items-start gap-1.5">
                        <span class="commit-dot mt-1 shrink-0" :class="c.type === 'commit' ? 'source-git' : 'source-svn'"></span>
                        <span class="truncate text-base-content/70">{{ c.label }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed }         from 'vue';
import { useRouter }        from 'vue-router';
import { useDayStore }      from '../../stores/useDayStore';
import { useUiStore }       from '../../stores/useUiStore';
import { usePickerStore }   from '../../stores/usePickerStore';
import { BROWSER_DOMAINS, BROWSER_TOTAL_VISITS, BROWSER_TOTAL_DOMAINS, TEAMS_MSG_COUNT } from '../../mock/data';
import type { ActiveView }  from '../../types';

const day    = useDayStore();
const ui     = useUiStore();
const picker = usePickerStore();
const router = useRouter();

function navigate(view: ActiveView) {
    const d  = picker.pickerSelected;
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    router.push(`/${view}/${yr}-${mo}-${dd}`);
}

// Derive email counts from store data
const emailIn  = computed(() => day.emails.filter(e => e.dir === 'in').length);
const emailOut = computed(() => day.emails.filter(e => e.dir === 'out').length);

// Derive email-per-US correlation from timeline events
const emailByUs = computed(() => {
    const corrMap = new Map<string, number>();
    let uncorrelated = 0;
    for (const ev of day.tlEvents) {
        if (ev.type !== 'email-in' && ev.type !== 'email-out') continue;
        if (ev.corrUs) {
            corrMap.set(ev.corrUs, (corrMap.get(ev.corrUs) ?? 0) + 1);
        } else {
            uncorrelated++;
        }
    }
    const groups = [...corrMap.entries()].map(([label, count]) => ({ label, count, isCorrelated: true }));
    if (uncorrelated > 0) groups.push({ label: 'Non correlate', count: uncorrelated, isCorrelated: false });
    return groups;
});

// Derive meeting data from timeline events
const meetingEvents = computed(() =>
    day.tlEvents
        .filter(ev => ev.type === 'meeting')
        .map(ev => ({ label: ev.label, time: `${ev.time} · ${ev.h} min` }))
);
const meetingCount = computed(() => meetingEvents.value.length);
const meetingDuration = computed(() => {
    const totalMin = day.tlEvents.filter(ev => ev.type === 'meeting').reduce((sum, ev) => sum + ev.h, 0);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
});

// Derive commit data from timeline events
const commitEvents = computed(() =>
    day.tlEvents.filter(ev => ev.type === 'commit' || ev.type === 'svn')
);
const gitCount = computed(() => day.tlEvents.filter(ev => ev.type === 'commit').length);
const svnCount = computed(() => day.tlEvents.filter(ev => ev.type === 'svn').length);
</script>
