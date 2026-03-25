import { defineStore }          from 'pinia';
import { ref, computed }        from 'vue';
import { DAYS, TS_ACTIVE, TS_PINNED, DAYABB_IT, MONTH_IT } from '../mock/data';
import { fetchWeek, fetchTpWeekHours, submitWeekHours as submitWeekHoursApi } from '../api';
import type { Day, TsRow, ApiWeekResponse, ApiTpWeekResponse, SubmitEdit, WeekDayResponse } from '../types';

export const useTimesheetStore = defineStore('timesheet', () => {
    const days   = ref<Day[]>(DAYS);
    const active = ref<TsRow[]>(TS_ACTIVE.map(r => ({ ...r, hours: [...(r.hours ?? [0,0,0,0,0,0,0])] })));
    const pinned = ref<TsRow[]>(TS_PINNED.map(r => ({ ...r })));

    const loading     = ref(false);
    const error       = ref<string | null>(null);
    const weekData    = ref<ApiWeekResponse | null>(null);
    const currentMonday = ref<string>('');

    const hoursEdits = ref<Record<string, number>>({});
    const noteEdits  = ref<Record<string, string>>({});

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
            console.log('[TS] fetchWeekData:', date, 'monday:', weekRes.monday, 'days:', weekRes.days.map(d => d.date));

            // Map week response to Day[]
            days.value = weekRes.days.map((d, idx) => {
                const dow      = idx; // 0=Mon...6=Sun
                const dayLabel = DAYABB_IT[([1,2,3,4,5,6,0][dow]) % 7] ?? '?';
                // Parse ISO date (YYYY-MM-DD) as local midnight to avoid UTC offset issues
                const parts = d.date.split('-');
                const dateObj = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
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
            console.log('[TS] days mapped:', days.value.map(d => d.date));

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

    /** Patch a single day in-place with fresh data from the backend (e.g. after Zucchetti submit). */
    function patchDay(dayIdx: number, update: WeekDayResponse) {
        const d = days.value[dayIdx];
        if (!d) return;
        d.zucHours = update.oreTarget;
        d.holiday  = update.holiday ?? !update.isWorkday;
        d.nibol    = update.nibol;
        if (weekData.value?.days?.[dayIdx]) {
            weekData.value.days[dayIdx] = update;
        }
    }

    const totalsRow = computed(() => {
        const allRows = [...active.value, ...pinned.value];
        const tp    = days.value.map((_, i) =>
            allRows.reduce((acc, r) => acc + getHours(r.tpId, i), 0)
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

    function clearEdits() {
        hoursEdits.value = {};
        noteEdits.value  = {};
    }

    function buildEdits(filterDayIdx?: number): SubmitEdit[] {
        const monday = currentMonday.value;
        if (!monday) return [];
        const edits: SubmitEdit[] = [];
        for (const [key, hours] of Object.entries(hoursEdits.value)) {
            if (!hours || hours <= 0) continue;
            const [tpIdStr, dayIdxStr] = key.split('_');
            const tpId   = Number(tpIdStr);
            const dayIdx = Number(dayIdxStr);
            if (dayIdx < 0 || dayIdx > 4) continue;
            if (filterDayIdx !== undefined && dayIdx !== filterDayIdx) continue;

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
        return edits;
    }

    /**
     * Bulk-submits all hoursEdits to TargetProcess.
     * On full success, clears edits and reloads week data.
     * Returns { submitted, errors } from the API.
     */
    async function submitWeekHours(): Promise<{ submitted: number; errors: unknown[] }> {
        const monday = currentMonday.value;
        if (!monday) throw new Error('No week loaded');
        const result = await submitWeekHoursApi(monday, buildEdits());
        if (result.errors.length === 0) {
            clearEdits();
            await fetchWeekData(monday);
        }
        return result;
    }

    /**
     * Submits only the edits for a single day (0=Mon … 4=Fri).
     * On full success, clears that day's edits and reloads week data.
     */
    async function submitDayHours(dayIdx: number): Promise<{ submitted: number; errors: unknown[] }> {
        const monday = currentMonday.value;
        if (!monday) throw new Error('No week loaded');
        if (dayIdx < 0 || dayIdx > 4) throw new Error('Invalid day index');
        const result = await submitWeekHoursApi(monday, buildEdits(dayIdx));
        if (result.errors.length === 0) {
            for (const key of Object.keys(hoursEdits.value)) {
                if (key.endsWith(`_${dayIdx}`)) {
                    delete hoursEdits.value[key];
                    delete noteEdits.value[key];
                }
            }
            await fetchWeekData(monday);
        }
        return result;
    }

    return {
        days, active, pinned,
        loading, error,
        weekData, currentMonday,
        hoursEdits, noteEdits,
        getHours, getNote, setHours, setNote, fillDay, patchDay, fetchWeekData, submitWeekHours, submitDayHours,
        totalsRow, rendPerDay,
    };
}, {
    persist: [
        { key: 'portal_hours',    pick: ['hoursEdits'] },
        { key: 'portal_ts_notes', pick: ['noteEdits']  },
    ],
});
