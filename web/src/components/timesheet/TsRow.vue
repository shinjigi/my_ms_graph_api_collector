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
            <!-- Pinned row: quick-add + button -->
            <template v-else-if="isPinned">
                <button class="pin-add-btn" @click.stop="quickAdd(i)" title="+0.5h">
                    <span v-if="ts.getHours(row.tpId, i) > 0" class="pin-add-hours">{{ ts.getHours(row.tpId, i) }}h</span>
                    <span class="pin-add-plus">+</span>
                    <span v-if="isPending && ts.getHours(row.tpId, i) > 0" class="loading loading-ring loading-xs text-warning ml-0.5"></span>
                </button>
            </template>
            <!-- Active row: full widget -->
            <template v-else>
                <div class="flex flex-col items-center gap-0">
                    <TimeCellWidget
                        :model-value="ts.getHours(row.tpId, i)"
                        :extra-val-cls="`font-bold text-xs ${i === 4 ? 'text-primary' : ''}`"
                        :day-delta="ts.totalsRow.delta[i]"
                        @update="val => ts.setHours(row.tpId, i, val)"
                    />
                    <TsNoteCell :tpId="row.tpId" :day-idx="i" />
                    <div class="flex gap-1 mt-0.5">
                        <span v-if="row.git?.[i]" class="commit-dot source-git" ></span>
                        <span v-if="row.svn?.[i]" class="commit-dot source-svn" ></span>
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
import { computed }          from 'vue';
import { useTimesheetStore } from '../../stores/useTimesheetStore';
import { usePickerStore }    from '../../stores/usePickerStore';
import { useUiStore }        from '../../stores/useUiStore';
import { stateColor, tpLink as makeTpLink } from '../../utils';
import type { TsRow, Day }   from '../../types';
import TimeCellWidget        from '../TimeCellWidget.vue';
import TsNoteCell            from './TsNoteCell.vue';

const props = defineProps<{ row: TsRow; isPinned: boolean }>();

const isPending = computed(() => ts.pendingPromotion.includes(props.row.tpId));

function quickAdd(dayIdx: number) {
    ts.setHours(props.row.tpId, dayIdx, ts.getHours(props.row.tpId, dayIdx) + 0.5);
    ts.schedulePromotion(props.row.tpId);
}

const ts     = useTimesheetStore();
const picker = usePickerStore();
const ui     = useUiStore();
const days   = computed(() => ts.days);

function selectDay(dayIdx: number) {
    const sel = picker.pickerSelected;
    const dow = sel.getDay();
    const monday = new Date(sel);
    monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
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
</style>
