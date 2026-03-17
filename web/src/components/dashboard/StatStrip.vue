<template>
    <div class="grid grid-cols-5 gap-2 mb-4">
        <!-- Ore Zuc -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Ore Zuc</div>
                <div class="text-xl font-bold text-success mt-0.5">{{ zucH }}<span class="text-sm">h</span> {{ zucM }}<span class="text-sm">m</span></div>
                <div class="text-xs text-base-content/40 mt-0.5">Ordinarie · Zucchetti</div>
            </div>
        </div>
        <!-- Rendicontazione (merged) -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Rendicontazione · TP</div>
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-xl font-bold text-primary">{{ day.dayTotals.tp }}h</span>
                    <span class="text-xs text-base-content/40">/ {{ day.dayTotals.zuc }}h</span>
                    <span class="text-xs text-base-content/35 ml-auto">{{ rendPct }}%</span>
                </div>
                <div class="h-1.5 rounded-full mt-1 overflow-hidden bg-base-300">
                    <div class="h-full rounded-full transition-all duration-300"
                         :class="rendPct >= 100 ? 'bg-success' : 'bg-primary'"
                         :style="{ width: rendPct + '%' }"></div>
                </div>
                <div class="text-xs font-bold mt-0.5"
                     :class="day.dayTotals.delta <= 0 ? 'text-success' : 'text-error'">
                    {{ day.dayTotals.delta <= 0 ? '✓ Rendicontato' : `−${day.dayTotals.delta}h da loggare` }}
                </div>
            </div>
        </div>
        <!-- Commit -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Commit</div>
                <div class="text-xl font-bold text-secondary mt-0.5">{{ commitTotal }}</div>
                <div class="text-xs text-base-content/40 mt-0.5">
                    <span class="commit-dot source-git mr-1"></span>{{ gitCount }} Git ·
                    <span class="commit-dot source-svn mx-1"></span>{{ svnCount }} SVN
                </div>
            </div>
        </div>
        <!-- Meeting -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Meeting</div>
                <div class="text-xl font-bold text-accent mt-0.5">{{ meetingCount }}</div>
                <div class="text-xs text-base-content/40 mt-0.5">Teams · Calendar</div>
            </div>
        </div>
        <!-- Email -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Email</div>
                <div class="text-xl font-bold text-info mt-0.5">{{ emailTotal }}</div>
                <div class="text-xs text-base-content/40 mt-0.5">Ricevute · {{ emailOut }} inviate</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed }    from 'vue';
import { useDayStore } from '../../stores/useDayStore';

const day = useDayStore();

// Zucchetti hours derived from store (decimal → h + m display)
const zucH = computed(() => Math.floor(day.dayTotals.zuc));
const zucM = computed(() => Math.round((day.dayTotals.zuc - zucH.value) * 60));

const rendPct = computed(() => {
    const { tp, zuc } = day.dayTotals;
    return zuc > 0 ? Math.min(100, Math.round(tp / zuc * 100)) : 0;
});

// Derive counts from timeline events and emails
const gitCount     = computed(() => day.tlEvents.filter(ev => ev.type === 'commit').length);
const svnCount     = computed(() => day.tlEvents.filter(ev => ev.type === 'svn').length);
const commitTotal  = computed(() => gitCount.value + svnCount.value);
const meetingCount = computed(() => day.tlEvents.filter(ev => ev.type === 'meeting').length);
const emailTotal   = computed(() => day.emails.length);
const emailOut     = computed(() => day.emails.filter(e => e.dir === 'out').length);
</script>
