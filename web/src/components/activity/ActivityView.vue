<template>
    <div>
        <div class="flex items-center gap-3 mb-4">
            <h2 class="text-base font-bold">Commit — {{ dateLabel }}</h2>
            <span class="badge badge-outline badge-sm">
                <SignalBadge type="git" :count="day.gitCommits.length" label="Git" />
            </span>
            <span class="badge badge-outline badge-sm">
                <SignalBadge type="svn" :count="day.svnCommits.length" label="SVN" />
            </span>
        </div>

        <div v-if="day.gitCommits.length === 0 && day.svnCommits.length === 0"
             class="text-center py-12 text-base-content/30 text-sm">
            Nessun commit registrato per questo giorno.
        </div>

        <div v-else class="space-y-3">
            <!-- Git commits -->
            <template v-if="day.gitCommits.length > 0">
                <div class="text-xs font-bold text-base-content/50 uppercase tracking-wide mb-1 flex items-center gap-1.5">
                    <SignalBadge type="git" :label="`Git (${day.gitCommits.length})`" />
                </div>
                <BaseCard no-padding>
                    <div class="divide-y divide-base-200">
                        <div v-for="c in day.gitCommits" :key="c.hash" class="p-3 flex items-start gap-3">
                            <SignalBadge type="git" wrapper-class="mt-1.5 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-medium text-base-content/80 break-words">{{ firstLine(c.message) }}</div>
                                <div v-if="restOfMessage(c.message)" class="text-xs text-base-content/40 mt-0.5 whitespace-pre-wrap">{{ restOfMessage(c.message) }}</div>
                                <div class="flex items-center gap-2 mt-1 text-xs text-base-content/35 flex-wrap">
                                    <span class="font-mono text-base-content/25">{{ c.hash.slice(0, 8) }}</span>
                                    <span class="font-semibold text-base-content/50">{{ c.repo }}</span>
                                    <span>{{ c.author }}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </BaseCard>
            </template>

            <!-- SVN commits -->
            <template v-if="day.svnCommits.length > 0">
                <div class="text-xs font-bold text-base-content/50 uppercase tracking-wide mb-1 mt-4 flex items-center gap-1.5">
                    <SignalBadge type="svn" :label="`SVN (${day.svnCommits.length})`" />
                </div>
                <BaseCard no-padding>
                    <div class="divide-y divide-base-200">
                        <div v-for="c in day.svnCommits" :key="c.revision" class="p-3 flex items-start gap-3">
                            <SignalBadge type="svn" wrapper-class="mt-1.5 shrink-0" />
                            <div class="min-w-0 flex-1">
                                <div class="text-sm font-medium text-base-content/80 break-words">{{ firstLine(c.message) }}</div>
                                <div v-if="restOfMessage(c.message)" class="text-xs text-base-content/40 mt-0.5 whitespace-pre-wrap">{{ restOfMessage(c.message) }}</div>
                                <div class="flex items-center gap-2 mt-1 text-xs text-base-content/35 flex-wrap">
                                    <span class="font-mono text-base-content/25">r{{ c.revision }}</span>
                                    <span>{{ c.author }}</span>
                                    <div v-if="c.paths?.length" class="text-base-content/25 truncate max-w-xs">
                                        {{ c.paths.slice(0, 3).join(' · ') }}{{ c.paths.length > 3 ? ` +${c.paths.length - 3}` : '' }}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </BaseCard>
            </template>
        </div>
    </div>
</template>

<script setup lang="ts">
import { computed }  from 'vue';
import { usePickerStore }        from '../../stores/usePickerStore';
import { useDayStore }           from '../../stores/useDayStore';
import { firstLine, restOfMessage } from '../../utils';
import { formatDateLabel }       from '@shared/dates';
import BaseCard                  from '../common/BaseCard.vue';
import SignalBadge               from '../common/SignalBadge.vue';

const picker = usePickerStore();
const day    = useDayStore();

const dateLabel = computed(() => formatDateLabel(picker.pickerSelected));
</script>
