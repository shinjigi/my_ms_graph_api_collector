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
            @click.stop="!d.holiday && !isPinned ? selectDay(i) : undefined">
            <template v-if="d.holiday">
                <span class="text-xs ts-holiday-icon">🇮🇹</span>
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
                                    @click.stop="analysis.dismissHint(row.tpId, i, ts.currentMonday)"
                                    title="Ignora suggerimento">✕</button>
                        </div>
                    </template>
                    <!-- ALTRI STATI: widget normale con indicatori passivi -->
                    <template v-else>
                        <TimeCellWidget
                            :model-value="ts.getHours(row.tpId, i)"
                            :extra-val-cls="`font-bold text-xs ${i === 4 ? 'text-primary' : ''}`"
                            :day-delta="ts.totalsRow.delta[i]"
                            :hint-val="cellHint(i)?.inferredHours"
                            :cell-mode="computeCellMode(i)"
                            @update="val => {
                                ts.setHours(row.tpId, i, val);
                                if (val === 0) ts.setNote(row.tpId, i, '');
                                else if (cellHint(i)?.comment)
                                    ts.setNote(row.tpId, i, cellHint(i)!.comment!);
                            }"
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
    if (Math.abs(ts.totalsRow.delta[i]) < 0.05 && (!hasEdit || hours === 0))
        return 'clean';

    if (!hint || hint.inferredHours <= 0)
        return hasEdit && hours > 0 ? 'user-edit' : 'clean';
    if (!hasEdit || hours === 0) return 'hint-only';
    if (+hours.toFixed(1) === +hint.inferredHours.toFixed(1)) return 'hint-match';
    return 'hint-differ';
}

function acceptHint(dayIdx: number) {
    const hint = cellHint(dayIdx);
    if (!hint || !ts.currentMonday) return;
    ts.setHours(props.row.tpId, dayIdx, hint.inferredHours);
    if (hint.comment)
        ts.setNote(props.row.tpId, dayIdx, hint.comment);
    
    // Persist to server
    const dateStr = shiftDate(ts.currentMonday!, dayIdx);
    analysis.setEntryStatus(dateStr, props.row.tpId, 'applied');
}

function quickAdd(dayIdx: number) {
    const hint    = cellHint(dayIdx);
    const current = ts.getHours(props.row.tpId, dayIdx);
    if (hint && current === 0) {
        ts.setHours(props.row.tpId, dayIdx, hint.inferredHours);
        if (hint.comment)
            ts.setNote(props.row.tpId, dayIdx, hint.comment);
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
    const cls: string[] = [];
    if (d.holiday) {
        cls.push('holiday-col');
    } else {
        const r = ts.rendPerDay[i] ?? null;
        if (r === 'ok')   cls.push('day-ok');
        if (r === 'warn') cls.push('day-warn');
        if (r === 'err')  cls.push('day-err');
    }
    if (i === picker.todayDayIdx)    cls.push('today-col');
    if (i === picker.selectedDayIdx) cls.push('selected-col');
    return cls;
}
</script>

<style scoped>
.pin-add-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 2px;
    width: 100%;
    padding: 2px 0;
    border-radius: 4px;
    font-size: 0.7rem;
    color: oklch(var(--bc) / 0.4);
    transition: color 0.15s, background 0.15s;
    cursor: pointer;
    background: transparent;
    border: none;
}
.pin-add-btn:hover {
    color: oklch(var(--bc) / 0.9);
    background: oklch(var(--b3));
}
.pin-add-hours {
    font-weight: 700;
    color: oklch(var(--wa));
}
.pin-add-plus {
    font-size: 0.85rem;
    font-weight: 700;
    line-height: 1;
}

/* AI hint button — usato sia su active rows che su pinned */
@keyframes ai-pulse {
    0%, 100% { box-shadow: 0 0 0 0 var(--ai-color); }
    50%       { box-shadow: 0 0 0 3px var(--ai-color); }
}
@keyframes ai-dot-blink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0.2; }
}
.ai-hint-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 2px 5px;
    border-radius: 4px;
    font-size: 0.7rem;
    font-weight: 700;
    cursor: pointer;
    background: transparent;
    border: 1px solid;
    transition: background 0.15s;
    /* default = medium/warning */
    --ai-color: oklch(var(--wa) / 0.45);
    color: oklch(var(--wa));
    border-color: oklch(var(--wa) / 0.5);
    animation: ai-pulse 2s ease-in-out infinite;
}
.ai-hint-btn.confidence-high {
    --ai-color: oklch(var(--su) / 0.45);
    color: oklch(var(--su));
    border-color: oklch(var(--su) / 0.5);
}
.ai-hint-btn.confidence-low {
    --ai-color: oklch(var(--er) / 0.3);
    color: oklch(var(--er) / 0.7);
    border-color: oklch(var(--er) / 0.35);
}
.ai-hint-btn:hover { background: oklch(var(--b3)); }
.ai-hint-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: currentColor;
    animation: ai-dot-blink 1.4s ease-in-out infinite;
}
.ai-hint-val { line-height: 1; }
</style>
