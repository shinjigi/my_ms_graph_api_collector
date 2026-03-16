<template>
    <div class="grid grid-cols-2 gap-3 content-start">
        <!-- Email -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3">
                <div class="text-xs font-bold text-base-content/50 uppercase mb-2">📧 Email</div>
                <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Ricevute</div><div class="font-bold text-base">12</div></div>
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Inviate</div><div class="font-bold text-base">4</div></div>
                </div>
                <div class="badge badge-error badge-xs mb-2">3 non lette</div>
                <div class="text-xs text-base-content/50 font-semibold mb-1">Per US</div>
                <div class="text-xs space-y-0.5">
                    <div class="flex justify-between"><span class="truncate text-base-content/70">Deploy #2026</span><span class="font-bold text-primary shrink-0 ml-1">3</span></div>
                    <div class="flex justify-between"><span class="truncate text-base-content/70">AssetVersioning</span><span class="font-bold text-primary shrink-0 ml-1">2</span></div>
                    <div class="flex justify-between"><span class="truncate text-base-content/70">PC emails net.</span><span class="font-bold text-primary shrink-0 ml-1">1</span></div>
                    <div class="flex justify-between text-base-content/30"><span class="truncate">Non correlate</span><span class="shrink-0 ml-1">6</span></div>
                </div>
            </div>
        </div>
        <!-- Teams -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3">
                <div class="text-xs font-bold text-base-content/50 uppercase mb-2">💬 Teams</div>
                <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Meeting</div><div class="font-bold text-base">3</div></div>
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Messaggi</div><div class="font-bold text-base">47</div></div>
                </div>
                <div class="text-xs text-base-content/50 font-semibold mb-1">Meeting oggi</div>
                <div class="space-y-1 text-xs">
                    <div v-for="m in meetings" :key="m.label" class="flex items-center gap-1.5">
                        <div style="width:3px;height:22px;background:#0ea5e9;border-radius:2px;flex-shrink:0"></div>
                        <div><div class="font-medium leading-tight">{{ m.label }}</div><div class="text-base-content/40">{{ m.time }}</div></div>
                    </div>
                </div>
                <div class="text-xs text-base-content/30 mt-2">Tempo meeting: <strong class="text-base-content/50">1h 30m</strong></div>
            </div>
        </div>
        <!-- Browser -->
        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3">
                <div class="flex items-center justify-between cursor-pointer select-none" @click="ui.toggleBrowser()">
                    <div class="text-xs font-bold text-base-content/50 uppercase">🌐 Browser</div>
                    <div class="flex items-center gap-1.5 text-xs text-base-content/35">
                        <span>142 visite · 23 domini</span>
                        <svg class="w-3 h-3 transition-transform" :class="ui.browserExpanded ? 'rotate-180' : ''" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"/>
                        </svg>
                    </div>
                </div>
                <div v-if="ui.browserExpanded">
                    <div class="grid grid-cols-2 gap-1.5 text-xs mb-2 mt-2">
                        <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Visite</div><div class="font-bold text-base">142</div></div>
                        <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Domini</div><div class="font-bold text-base">23</div></div>
                    </div>
                    <div class="text-xs text-base-content/50 font-semibold mb-1">Top domini</div>
                    <div class="space-y-1.5 text-xs">
                        <div v-for="d in domains" :key="d.domain">
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
        <div class="card bg-base-100 border border-base-300 shadow-sm">
            <div class="card-body p-3">
                <div class="text-xs font-bold text-base-content/50 uppercase mb-2">💻 Git · SVN</div>
                <div class="grid grid-cols-2 gap-1.5 text-xs mb-2">
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">Git</div><div class="font-bold text-base" style="color:#6366f1">3</div></div>
                    <div class="bg-base-200 rounded p-1.5 text-center"><div class="text-base-content/40 text-xs">SVN</div><div class="font-bold text-base" style="color:#f59e0b">1</div></div>
                </div>
                <div class="text-xs text-base-content/50 font-semibold mb-1">Commit oggi</div>
                <div class="space-y-1 text-xs">
                    <div v-for="c in commits" :key="c.msg" class="flex items-start gap-1.5">
                        <span class="commit-dot mt-1 shrink-0" :class="c.src === 'git' ? 'source-git' : 'source-svn'"></span>
                        <span class="truncate text-base-content/70">{{ c.msg }}</span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { useUiStore } from '../../stores/useUiStore';

const ui = useUiStore();

const meetings = [
    { label:'Standup BAU ITA',      time:'09:00 · 15 min' },
    { label:'Code Review #326279',  time:'15:00 · 45 min' },
    { label:'Sprint Review',        time:'16:30 · 30 min' },
];

const domains = [
    { domain:'github.com',           visits:38, pct:100 },
    { domain:'dev.azure.com',        visits:24, pct:63  },
    { domain:'learn.microsoft.com',  visits:19, pct:50  },
    { domain:'tpondemand.com',       visits:15, pct:39  },
];

const commits = [
    { src:'git', msg:'[ALine] Fix SVN/Git author filtering' },
    { src:'git', msg:'[LocalITA] Zucchetti scraper fix' },
    { src:'svn', msg:'[my_ms_graph_api_collector][#324913] PC emails network' },
    { src:'git', msg:'[shinjigi] Analyzer LLM multi-backend' },
];
</script>
