<template>
    <tr class="hover text-xs" :class="{ 'pinned-row': isPinned }">
        <td class="font-medium pl-3 truncate">
            <a :href="rowTpLink" target="_blank" class="hover:underline hover:text-primary transition-colors">{{ row.us }}</a>
        </td>
        <td class="truncate">
            <span class="state-dot-wrap">
                <span class="state-dot" :style="{ background: dotColor }"></span>
                {{ stateAbbr }}
            </span>
        </td>
        <!-- Day cells Mon–Fri -->
        <td v-for="(d, i) in days.slice(0, 5)" :key="i"
            class="text-center"
            :class="cellCls(d, i)"
            @click.stop="(!d.holiday || (d.holidayType === 'absence' && ts.getHours(row.tpId, i) > 0)) && !isPinned ? selectDay(i) : undefined">
            <template v-if="d.holiday && (d.holidayType !== 'absence' || ts.getHours(row.tpId, i) === 0)">
                <span class="text-xs ts-holiday-icon">{{ d.holidayType === 'absence' ? '🏖️' : '🇮🇹' }}</span>
            </template>
            <!-- Pinned row: quick-add + button (con supporto AI hint) -->
            <template v-else-if="isPinned">
                <div class="flex flex-col items-center gap-0.5">
                    <button class="pin-add-btn"
                            :class="{
                                'ai-hint-btn': !!(cellHint(i) && ts.getHours(row.tpId, i) === 0),
                                [`confidence-${cellHint(i)?.confidence}`]: !!(cellHint(i) && ts.getHours(row.tpId, i) === 0)
                            }"
                            @click.stop="quickAdd(i)"
                            :title="cellHint(i) && ts.getHours(row.tpId, i) === 0
                                ? `AI (${cellHint(i)!.confidence}): ${cellHint(i)!.inferredHours}h`
                                : '+0.5h'">
                        <span v-if="ts.getHours(row.tpId, i) > 0" class="pin-add-hours">{{ hoursToHhmm(ts.getHours(row.tpId, i)) }}</span>
                        <template v-else-if="cellHint(i)">
                            <span class="ai-hint-val">{{ cellHint(i)!.inferredHours }}h</span>
                            <span class="ai-hint-dot"></span>
                        </template>
                        <span v-else class="pin-add-plus">+</span>
                        <span v-if="isPending && ts.getHours(row.tpId, i) > 0" class="loading loading-ring loading-xs text-warning ml-0.5"></span>
                    </button>
                    <TsNoteCell v-if="ts.getHours(row.tpId, i) > 0" :tpId="row.tpId" :day-idx="i" />
                    <div class="flex gap-1">
                        <span v-if="row.git?.[i]" class="commit-dot source-git" :title="`${row.git[i]} git commit`"></span>
                        <span v-if="row.svn?.[i]" class="commit-dot source-svn" :title="`${row.svn[i]} svn commit`"></span>
                    </div>
                </div>
            </template>
            <!-- Active row: AI hint button OR full widget -->
            <template v-else>
                <div class="flex flex-col items-center gap-0">
                    <!-- HINT-ONLY: bottone pulsante AI -->
                    <template v-if="computeCellMode(i) === 'hint-only'">
                        <div class="relative group/hint">
                            <button class="ai-hint-btn"
                                    :class="`confidence-${cellHint(i)!.confidence}`"
                                    @click.stop="acceptHint(i)"
                                    :title="`AI (${cellHint(i)!.confidence}): ${(cellHint(i)!.reasoning ?? '').slice(0, 80)}`">
                                <span class="ai-hint-val">{{ cellHint(i)!.inferredHours }}h</span>
                                <span class="ai-hint-dot"></span>
                            </button>
                            <button class="ts-hint-dismiss"
                                    @click.stop="dismissHint(i)"
                                    title="Ignora suggerimento">✕</button>
                        </div>
                    </template>
                    <!-- ALTRI STATI: widget normale con indicatori passivi -->
                    <template v-else>
                        <TimeCellWidget
                            :model-value="ts.getHours(row.tpId, i)"
                            :extra-val-cls="`font-bold text-xs ${i === picker.selectedDayIdx ? 'text-primary' : ''}`"
                            :day-delta="ts.totalsRow.delta[i]"
                            :hint-val="cellHint(i)?.inferredHours"
                            :cell-mode="computeCellMode(i)"
                            @update="val => handleCellUpdate(i, val)"
                        />
                    </template>
                    <TsNoteCell :tpId="row.tpId" :day-idx="i" />
                    <div class="flex gap-1 mt-0.5">
                        <span v-if="row.git?.[i]" class="commit-dot source-git"></span>
                        <span v-if="row.svn?.[i]" class="commit-dot source-svn"></span>
                    </div>
                </div>
            </template>
        </td>
        <!-- WE: collapsed = combined Sab+Dom; expanded = Sabato cell -->
        <td class="text-center weekend-col we-col">
            <div class="flex flex-col items-center gap-0">
                <TimeCellWidget
                    :model-value="ui.weVisible ? ts.getHours(row.tpId, 5) : weHours"
                    :extra-val-cls="'font-bold text-xs opacity-60'"
                    @update="val => ts.setHours(row.tpId, 5, val)"
                />
                <div class="flex gap-1 mt-0.5">
                    <span v-if="ui.weVisible ? row.git?.[5] : (row.git?.[5] ?? 0) + (row.git?.[6] ?? 0)" class="commit-dot source-git"></span>
                    <span v-if="ui.weVisible ? row.svn?.[5] : (row.svn?.[5] ?? 0) + (row.svn?.[6] ?? 0)" class="commit-dot source-svn"></span>
                </div>
            </div>
        </td>
        <!-- Domenica — solo quando WE espanso -->
        <td v-if="ui.weVisible" class="text-center weekend-col">
            <div class="flex flex-col items-center gap-0">
                <TimeCellWidget
                    :model-value="ts.getHours(row.tpId, 6)"
                    :extra-val-cls="'font-bold text-xs opacity-60'"
                    @update="val => ts.setHours(row.tpId, 6, val)"
                />
                <div class="flex gap-1 mt-0.5">
                    <span v-if="row.git?.[6]" class="commit-dot source-git"></span>
                    <span v-if="row.svn?.[6]" class="commit-dot source-svn"></span>
                </div>
            </div>
        </td>
        <!-- Tot -->
        <td class="text-center text-xs">
            <span class="text-success font-bold">{{ weekTotal }}</span>
            <span class="text-base-content/35 text-xs">/{{ row.totAllTime }}h</span>
        </td>
        <!-- Rem -->
        <td class="text-center text-xs">
            <span v-if="row.rem != null" class="text-warning text-xs">{{ row.rem }}</span>
            <span v-else class="text-base-content/25 text-xs">—</span>
        </td>
    </tr>
</template>

<script setup lang="ts">
import { computed }            from 'vue';
import { useTimesheetStore }   from '../../stores/useTimesheetStore';
import { usePickerStore }      from '../../stores/usePickerStore';
import { useUiStore }          from '../../stores/useUiStore';
import { useAnalysisStore }    from '../../stores/useAnalysisStore';
import { stateColor, tpLink as makeTpLink } from '../../utils';
import { hoursToHhmm, getMonday, shiftDate } from '@shared/dates';
import type { TsRow, Day, CellMode } from '../../types';
import TimeCellWidget          from '../TimeCellWidget.vue';
import TsNoteCell              from './TsNoteCell.vue';

const props = defineProps<{ row: TsRow; isPinned: boolean }>();

const ts       = useTimesheetStore();
const picker   = usePickerStore();
const ui       = useUiStore();
const analysis = useAnalysisStore();

const isPending = computed(() => ts.pendingPromotion.includes(props.row.tpId));

function cellHint(i: number) {
    const monday = ts.currentMonday;
    if (!monday) return null;
    return analysis.getHint(props.row.tpId, i, monday);
}

function computeCellMode(i: number): CellMode {
    const hint    = cellHint(i);
    const key     = `${props.row.tpId}_${i}`;
    const hasEdit = key in ts.hoursEdits;
    const hours   = ts.getHours(props.row.tpId, i);

    // If day is balanced, hide pulsating hints (hint-only) for tasks without hours
    if (Math.abs(ts.totalsRow.delta[i]) < 0.05 && hours === 0)
        return 'clean';

    if (!hint || hint.inferredHours <= 0)
        return hasEdit ? 'user-edit' : 'clean';
        
    if (hasEdit) return 'user-edit';
    
    if (hours === 0) return 'hint-only';
    if (+hours.toFixed(1) === +hint.inferredHours.toFixed(1)) return 'hint-match';
    return 'hint-differ';
}

function acceptHint(dayIdx: number) {
    const hint = cellHint(dayIdx);
    if (!hint || !ts.currentMonday) return;
    ts.setHours(props.row.tpId, dayIdx, hint.inferredHours);
    const noteText = hint.comment || hint.reasoning;
    if (noteText)
        ts.setNote(props.row.tpId, dayIdx, noteText);
    const dateStr = shiftDate(ts.currentMonday!, dayIdx);
    analysis.setEntryStatus(dateStr, props.row.tpId, 'accepted');
}

function dismissHint(dayIdx: number) {
    if (!ts.currentMonday) return;
    analysis.dismissHint(props.row.tpId, dayIdx, ts.currentMonday);
    ts.clearCellEdit(props.row.tpId, dayIdx);
}

function handleCellUpdate(dayIdx: number, val: number) {
    ts.setHours(props.row.tpId, dayIdx, val);
    if (val === 0) {
        ts.setNote(props.row.tpId, dayIdx, '');
    } else {
        const noteText = cellHint(dayIdx)?.comment || cellHint(dayIdx)?.reasoning;
        if (noteText) ts.setNote(props.row.tpId, dayIdx, noteText);
    }
    const hint = cellHint(dayIdx);
    if (hint?.status === 'accepted' && val !== hint.inferredHours && ts.currentMonday) {
        const dateStr = shiftDate(ts.currentMonday, dayIdx);
        analysis.setEntryStatus(dateStr, props.row.tpId, 'overridden');
    }
}

function quickAdd(dayIdx: number) {
    const hint    = cellHint(dayIdx);
    const current = ts.getHours(props.row.tpId, dayIdx);
    if (hint && current === 0) {
        ts.setHours(props.row.tpId, dayIdx, hint.inferredHours);
        const noteText = hint.comment || hint.reasoning;
        if (noteText)
            ts.setNote(props.row.tpId, dayIdx, noteText);
        if (ts.currentMonday) {
            const dateStr = shiftDate(ts.currentMonday, dayIdx);
            analysis.setEntryStatus(dateStr, props.row.tpId, 'accepted');
        }
    } else {
        ts.setHours(props.row.tpId, dayIdx, current + 0.5);
    }
    ts.schedulePromotion(props.row.tpId);
}
const days   = computed(() => ts.days);

function selectDay(dayIdx: number) {
    const monday = getMonday(picker.pickerSelected);
    const d = new Date(monday);
    d.setDate(monday.getDate() + dayIdx);
    picker.selectDay(d.getFullYear(), d.getMonth(), d.getDate());
}

const rowTpLink = makeTpLink(props.row.tpId);
const dotColor  = computed(() => stateColor(props.row.state));
const stateAbbr = computed(() =>
    ({
        'Inception': 'Inception',
        'Dev/Unit test': 'Dev',
        'Development / Unit test': 'Dev',
        'Testing': 'Test',
        'Done': 'Done',
    }[props.row.state] ?? props.row.state)
);
const weHours = computed(() =>
    (ts.getHours(props.row.tpId, 5)) + (ts.getHours(props.row.tpId, 6))
);
const weekTotal = computed(() =>
    +days.value.reduce((acc, _, i) => acc + ts.getHours(props.row.tpId, i), 0).toFixed(1)
);

function cellCls(d: Day, i: number): string[] {
    return ts.getDayColCls(i);
}
</script>

<style scoped>
/* Layout only — color/border handled by :not(.ai-hint-btn) to avoid overriding global ai-hint-btn */
.pin-add-btn {
    display: inline-flex; align-items: center; justify-content: center;
    gap: 2px; width: 100%; padding: 2px 0; border-radius: 4px;
    font-size: 0.7rem; transition: color 0.15s, background 0.15s;
    cursor: pointer; background: transparent;
}
.pin-add-btn:not(.ai-hint-btn)       { color: oklch(var(--bc) / 0.4); border: none; }
.pin-add-btn:not(.ai-hint-btn):hover { color: oklch(var(--bc) / 0.9); background: oklch(var(--b3)); }
.pin-add-hours { font-weight: 700; color: oklch(var(--wa)); }
.pin-add-plus  { font-size: 0.85rem; font-weight: 700; line-height: 1; }

/* Dismiss button for AI hint overlay */
.ts-hint-dismiss {
    position: absolute; right: -6px; top: -6px;
    font-size: 0.55rem; width: 12px; height: 12px;
    background: oklch(var(--b3)); color: oklch(var(--bc) / 0.5);
    border-radius: 50%; display: flex; align-items: center; justify-content: center;
    cursor: pointer; opacity: 0; transition: opacity 0.15s, color 0.1s;
    z-index: 10; border: 1px solid oklch(var(--b3));
}
.group\/hint:hover .ts-hint-dismiss { opacity: 1; }
.ts-hint-dismiss:hover { color: oklch(var(--er)); }
</style>
