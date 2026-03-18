import { defineStore }          from 'pinia';
import { ref, computed, watch } from 'vue';
import { DAYS, TS_ACTIVE, TS_PINNED, DAYABB_IT, MONTH_IT } from '../mock/data';
import { fetchWeek, fetchTpWeekHours, submitWeekHours as submitWeekHoursApi } from '../api';
import { loadJson }             from '../utils';
import type { Day, TsRow, ApiWeekResponse, ApiTpWeekResponse, SubmitEdit } from '../types';

export const useTimesheetStore = defineStore('timesheet', () => {
    const days   = ref<Day[]>(DAYS);
    const active = ref<TsRow[]>(TS_ACTIVE.map(r => ({ ...r, hours: [...(r.hours ?? [0,0,0,0,0,0,0])] })));
    const pinned = ref<TsRow[]>(TS_PINNED.map(r => ({ ...r })));

    const loading     = ref(false);
    const error       = ref<string | null>(null);
    const weekData    = ref<ApiWeekResponse | null>(null);
    const currentMonday = ref<string>('');

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
            const [weekRes, tpData] = await Promise.all([
                fetchWeek(date),
                fetchTpWeekHours(date),
            ]);

            currentMonday.value = weekRes.monday;

            // Map week response to Day[]
            days.value = weekRes.days.map((d, idx) => {
                const dow      = idx; // 0=Mon...6=Sun
                const dayLabel = DAYABB_IT[([1,2,3,4,5,6,0][dow]) % 7] ?? '?';
                const dateObj  = new Date(d.date);
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

            // Map entries to rows; split active (has hours this week) vs pinned (no hours yet)
            const allRows = tpData.entries.map((e: any) => ({
                project:    e.projectName,
                us:         e.usName,
                tpId:       e.tpId,
                state:      e.stateName,
                totAllTime: e.timeSpent,
                hours:      [...e.hours, 0, 0], // Pad to 7 (Mon-Sun)
                notes:      [null, null, null, null, null, null, null],
            }));

            // Items with at least one hour logged this week → active (prominent)
            // Items with no hours yet → pinned (available for logging)
            active.value = allRows.filter(r => (r.hours as number[]).slice(0, 5).some(h => h > 0));
            pinned.value = allRows.filter(r => !(r.hours as number[]).slice(0, 5).some(h => h > 0));

            // Set weekData last — triggers useDayStore watcher after active/pinned are populated
            weekData.value = weekRes;
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

    /**
     * Bulk-submits all hoursEdits to TargetProcess.
     * Returns { submitted, errors } from the API.
     */
    async function submitWeekHours(): Promise<{ submitted: number; errors: unknown[] }> {
        const monday = currentMonday.value;
        if (!monday) throw new Error('No week loaded');

        const edits: SubmitEdit[] = [];
        for (const [key, hours] of Object.entries(hoursEdits.value)) {
            if (!hours || hours <= 0) continue;
            const [tpIdStr, dayIdxStr] = key.split('_');
            const tpId   = Number(tpIdStr);
            const dayIdx = Number(dayIdxStr);
            if (dayIdx < 0 || dayIdx > 4) continue;

            const mondayDate = new Date(monday);
            mondayDate.setDate(mondayDate.getDate() + dayIdx);
            const yr  = mondayDate.getFullYear();
            const mo  = String(mondayDate.getMonth() + 1).padStart(2, '0');
            const day = String(mondayDate.getDate()).padStart(2, '0');

            edits.push({
                tpId,
                dayIdx,
                hours,
                date:        `${yr}-${mo}-${day}`,
                description: noteEdits.value[key] ?? '',
            });
        }

        return submitWeekHoursApi(monday, edits);
    }

    return {
        days, active, pinned,
        loading, error,
        weekData, currentMonday,
        hoursEdits, noteEdits,
        getHours, getNote, setHours, setNote, fillDay, fetchWeekData, submitWeekHours,
        totalsRow, rendPerDay,
    };
});
