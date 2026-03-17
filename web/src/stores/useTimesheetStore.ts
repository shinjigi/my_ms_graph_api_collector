import { defineStore }          from 'pinia';
import { ref, computed, watch } from 'vue';
import { DAYS, TS_ACTIVE, TS_PINNED } from '../mock/data';
import { loadJson }             from '../utils';

export const useTimesheetStore = defineStore('timesheet', () => {
    const days   = ref(DAYS);
    const active = ref(TS_ACTIVE.map(r => ({ ...r, hours: [...(r.hours ?? [0,0,0,0,0,0,0])] })));
    const pinned = ref(TS_PINNED.map(r => ({ ...r })));

    const hoursEdits = ref<Record<string, number>>(loadJson('portal_hours', {}));
    const noteEdits  = ref<Record<string, string>>(loadJson('portal_ts_notes', {}));

    watch(hoursEdits, val => localStorage.setItem('portal_hours',    JSON.stringify(val)), { deep: true });
    watch(noteEdits,  val => localStorage.setItem('portal_ts_notes', JSON.stringify(val)), { deep: true });

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
        hoursEdits, noteEdits,
        getHours, getNote, setHours, setNote, fillDay,
        totalsRow, rendPerDay,
    };
});
