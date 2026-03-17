import { defineStore }          from 'pinia';
import { ref, computed, watch } from 'vue';
import { DAYS, TS_ACTIVE, TS_PINNED } from '../mock/data';

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

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

    const totalsRow = computed(() => {
        const tp    = days.value.map((_, i) =>
            active.value.reduce((acc, r) => acc + getHours(r.tpId, i), 0)
        );
        const zuc   = days.value.map(d => d.zucHours);
        const delta = tp.map((t, i) => +((zuc[i] ?? 0) - t).toFixed(1));
        return { tp, zuc, delta };
    });

    return {
        days, active, pinned,
        hoursEdits, noteEdits,
        getHours, getNote, setHours, setNote,
        totalsRow,
    };
});
