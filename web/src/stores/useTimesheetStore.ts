import { defineStore }          from 'pinia';
import { ref, computed, watch } from 'vue';
import { DAYS, TS_ACTIVE, TS_PINNED, DAYABB_IT, MONTH_IT } from '../mock/data';
import { fetchWeek, fetchTpWeekHours } from '../api';
import { loadJson }             from '../utils';
import type { Day, TsRow, ApiWeekResponse, ApiTpWeekResponse } from '../types';

export const useTimesheetStore = defineStore('timesheet', () => {
    const days   = ref<Day[]>(DAYS);
    const active = ref<TsRow[]>(TS_ACTIVE.map(r => ({ ...r, hours: [...(r.hours ?? [0,0,0,0,0,0,0])] })));
    const pinned = ref<TsRow[]>(TS_PINNED.map(r => ({ ...r })));

    const loading = ref(false);
    const error   = ref<string | null>(null);

    const hoursEdits = ref<Record<string, number>>(loadJson('portal_hours', {}));
    const noteEdits  = ref<Record<string, string>>(loadJson('portal_ts_notes', {}));

    watch(hoursEdits, val => localStorage.setItem('portal_hours',    JSON.stringify(val)), { deep: true });
    watch(noteEdits,  val => localStorage.setItem('portal_ts_notes', JSON.stringify(val)), { deep: true });

    /**
     * Fetch week data from backend and populate days/active/pinned.
     * Falls back to mock data if backend is unavailable.
     */
    async function fetchWeekData(date: string): Promise<void> {
        loading.value = true;
        error.value   = null;

        try {
            const [weekData, tpData] = await Promise.all([
                fetchWeek(date),
                fetchTpWeekHours(date),
            ]);

            // Map week response to Day[]
            days.value = weekData.days.map((d, idx) => {
                const dow = idx; // 0=Mon...6=Sun
                const dayLabel = DAYABB_IT[([1,2,3,4,5,6,0][dow]) % 7] ?? '?';
                const dateObj = new Date(d.date);
                const dateLabel = `${dateObj.getDate()} ${MONTH_IT[dateObj.getMonth()].substring(0, 3)}`;

                return {
                    label:        dayLabel,
                    date:         dateLabel,
                    rend:         null, // computed by rendPerDay
                    zucHours:     d.oreTarget,
                    nibol:        d.nibol,
                    holiday:      d.holiday,
                    holidayName:  d.holidayName,
                };
            });

            // Map TP week response to TsRow[]
            active.value = tpData.entries.map(e => ({
                project:    e.projectName,
                us:         e.usName,
                tpId:       e.tpId,
                state:      e.stateName,
                totAllTime: e.timeSpent,
                hours:      [...e.hours, 0, 0], // Pad to 7 (Mon-Sun)
                notes:      [null, null, null, null, null, null, null],
            }));

            // Map unassigned open items to pinned (items not in active)
            const activeIds = new Set(active.value.map(r => r.tpId));
            pinned.value = tpData.openItems
                .filter((item: any) => !activeIds.has(item.id))
                .map((item: any) => ({
                    project:    item.projectName,
                    us:         item.name,
                    tpId:       item.id,
                    state:      item.stateName,
                    totAllTime: item.timeSpent,
                }));
        } catch (err) {
            console.warn('fetchWeekData failed, falling back to mock data:', (err as Error).message);
            // Keep existing mock data
        } finally {
            loading.value = false;
        }
    }

    function getHours(tpId: number, dayIdx: number): number {
        const key = `${tpId}_${dayIdx}`;
        if (key in hoursEdits.value) return hoursEdits.value[key];
        const row = [...active.value, ...pinned.value].find(r => r.tpId === tpId);
        return row?.hours?.[dayIdx] ?? 0;
    }

    function getNote(tpId: number, dayIdx: number): string {
        const key = `${tpId}_${dayIdx}`;
        if (key in noteEdits.value) return noteEdits.value[key];
        const row = [...active.value, ...pinned.value].find(r => r.tpId === tpId);
        return row?.notes?.[dayIdx] ?? '';
    }

    function setHours(tpId: number, dayIdx: number, val: number) {
        hoursEdits.value[`${tpId}_${dayIdx}`] = Math.max(0, +val.toFixed(1));
    }

    function setNote(tpId: number, dayIdx: number, text: string) {
        noteEdits.value[`${tpId}_${dayIdx}`] = text;
    }

    /**
     * Auto-fill a weekday column (0=Mon…4=Fri) across active tasks.
     * Hours are distributed proportionally by totAllTime weight;
     * the last task absorbs any rounding difference.
     * totalHours = 0 clears the entire column.
     */
    function fillDay(dayIdx: number, totalHours: number) {
        if (dayIdx < 0 || dayIdx > 4) return;
        const tasks = active.value;
        if (!tasks.length) return;

        if (totalHours === 0) {
            tasks.forEach(r => setHours(r.tpId, dayIdx, 0));
            return;
        }

        const totalWeight = tasks.reduce((sum, r) => sum + Math.max(r.totAllTime ?? 1, 1), 0);
        let assigned = 0;
        tasks.forEach((r, i) => {
            if (i === tasks.length - 1) {
                setHours(r.tpId, dayIdx, +Math.max(0, totalHours - assigned).toFixed(1));
            } else {
                const rounded = Math.round(totalHours * Math.max(r.totAllTime ?? 1, 1) / totalWeight * 2) / 2;
                setHours(r.tpId, dayIdx, rounded);
                assigned += rounded;
            }
        });
    }

    const totalsRow = computed(() => {
        const tp    = days.value.map((_, i) =>
            active.value.reduce((acc, r) => acc + getHours(r.tpId, i), 0)
        );
        const zuc   = days.value.map(d => d.zucHours);
        const delta = tp.map((t, i) => +((zuc[i] ?? 0) - t).toFixed(1));
        return { tp, zuc, delta };
    });

    // Reactive rend status per day, derived from actual TP vs Zucchetti hours.
    const rendPerDay = computed<Array<'ok' | 'warn' | 'err' | null>>(() =>
        days.value.map((d, i) => {
            if (d.holiday || i >= 5) return null;
            if (d.zucHours === 0)    return null;
            const delta = totalsRow.value.delta[i];
            const tp    = totalsRow.value.tp[i];
            if (delta === 0) return 'ok';
            if (tp    === 0) return 'err';
            return 'warn';
        })
    );

    return {
        days, active, pinned,
        loading, error,
        hoursEdits, noteEdits,
        getHours, getNote, setHours, setNote, fillDay, fetchWeekData,
        totalsRow, rendPerDay,
    };
});
