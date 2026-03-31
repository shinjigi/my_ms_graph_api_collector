<template>
    <div class="grid grid-cols-6 gap-2 mb-4">
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
        <div class="card bg-base-100 shadow-sm border border-base-300 cursor-pointer hover:border-secondary/50 transition-colors"
             @click="navigate('activity')">
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
        <div class="card bg-base-100 shadow-sm border border-base-300 cursor-pointer hover:border-accent/50 transition-colors"
             @click="navigate('teams')">
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
        <!-- AI Proposal -->
        <div class="card bg-base-100 shadow-sm border border-base-300">
            <div class="card-body p-3">
                <div class="text-xs text-base-content/50 uppercase tracking-wide">AI Proposal</div>
                <template v-if="analysis.isRunning">
                    <div class="flex items-center gap-2 mt-1">
                        <span class="loading loading-spinner loading-sm text-secondary"></span>
                        <span class="text-xs text-base-content/50">Analisi in corso...</span>
                    </div>
                    <div class="text-xs text-base-content/30 mt-0.5">
                        {{ analysis.status?.dates?.length ?? 1 }} giorni
                    </div>
                </template>
                <template v-else-if="analysis.error">
                    <div class="text-sm font-bold text-error mt-0.5">Errore</div>
                    <div class="text-xs text-error/70 mt-0.5 truncate" :title="analysis.error">{{ analysis.error }}</div>
                </template>
                <template v-else-if="analysis.proposal">
                    <div class="flex items-baseline gap-1 mt-0.5">
                        <span class="text-xl font-bold text-secondary">{{ analysis.proposal.entries.length }}</span>
                        <span class="text-xs text-base-content/40">entries</span>
                    </div>
                    <div class="text-xs text-base-content/40 mt-0.5 truncate"
                         :title="analysis.provider ?? ''">
                        {{ providerShort }} · {{ analysis.lastRun }}
                    </div>
                </template>
                <template v-else>
                    <div class="text-sm text-base-content/30 mt-1">Nessuna proposta</div>
                    <div class="text-xs text-base-content/20 mt-0.5">per questo giorno</div>
                </template>
                <button class="btn btn-xs btn-outline btn-secondary mt-1 w-full"
                        :disabled="analysis.isRunning"
                        @click="runAnalysis">
                    {{ analysis.proposal ? 'Ri-analizza' : 'Analizza' }}
                </button>
            </div>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed, watch }      from 'vue';
import { useRouter }            from 'vue-router';
import { useDayStore }          from '../../stores/useDayStore';
import { useAnalysisStore }     from '../../stores/useAnalysisStore';
import { usePickerStore }       from '../../stores/usePickerStore';
import { dateToString }         from '@shared/dates';
import type { ActiveView }      from '../../types';

const day      = useDayStore();
const analysis = useAnalysisStore();
const picker   = usePickerStore();
const router   = useRouter();

function navigate(view: ActiveView) {
    router.push(`/${view}/${dateToString(picker.pickerSelected)}`);
}

// Zucchetti hours derived from store (decimal -> h + m display)
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

// Shorten provider name for display
const providerShort = computed(() => {
    const p = analysis.provider;
    if (!p) return '';
    if (p.startsWith('claude:'))  return 'Claude';
    if (p.startsWith('gemini:')) return 'Gemini';
    return p;
});

function selectedDateStr(): string {
    return dateToString(picker.pickerSelected);
}

function runAnalysis() {
    const force = !!analysis.proposal;
    analysis.runDay(selectedDateStr(), force);
}

// Load existing proposal when selected day changes
watch(() => picker.pickerSelected, () => {
    analysis.loadProposal(selectedDateStr());
}, { immediate: true });
</script>
