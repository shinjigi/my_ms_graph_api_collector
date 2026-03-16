<template>
    <div class="grid grid-cols-6 gap-2 mb-4">
        <!-- Ore Zuc -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Ore Zuc</div>
                <div class="text-xl font-bold text-success mt-0.5">7<span class="text-sm">h</span> 30<span class="text-sm">m</span></div>
                <div class="text-xs text-base-content/40 mt-0.5">Ordinarie · Zucchetti</div>
            </div>
        </div>
        <!-- Ore TP -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Ore TP</div>
                <div class="text-xl font-bold text-primary mt-0.5">{{ day.dayTotals.tp }}<span class="text-sm">h</span></div>
                <div class="text-xs text-base-content/40 mt-0.5">Loggate · TargetProcess</div>
            </div>
        </div>
        <!-- Rendicontazione -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Rendicontazione</div>
                <div class="flex items-baseline gap-1 mt-0.5">
                    <span class="text-xl font-bold text-primary">{{ day.dayTotals.tp }}</span>
                    <span class="text-xs text-base-content/40">/ {{ day.dayTotals.zuc }}h</span>
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
                <div class="text-xl font-bold text-secondary mt-0.5">4</div>
                <div class="text-xs text-base-content/40 mt-0.5">
                    <span class="commit-dot source-git mr-1"></span>3 Git ·
                    <span class="commit-dot source-svn mx-1"></span>1 SVN
                </div>
            </div>
        </div>
        <!-- Meeting -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Meeting</div>
                <div class="text-xl font-bold text-accent mt-0.5">3</div>
                <div class="text-xs text-base-content/40 mt-0.5">Teams · Calendar</div>
            </div>
        </div>
        <!-- Email -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">Email</div>
                <div class="text-xl font-bold text-info mt-0.5">12</div>
                <div class="text-xs text-base-content/40 mt-0.5">Ricevute · 4 inviate</div>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed }    from 'vue';
import { useDayStore } from '../../stores/useDayStore';

const day = useDayStore();

const rendPct = computed(() => {
    const { tp, zuc } = day.dayTotals;
    return zuc > 0 ? Math.min(100, Math.round(tp / zuc * 100)) : 0;
});
</script>
