import { defineStore }          from 'pinia';
import { ref, computed, watch } from 'vue';
import { US_TODAY_DEFAULT, TS_ACTIVE, TS_PINNED, TL_EVENTS, EMAILS } from '../mock/data';
import type { UsCard } from '../types';

function loadJson<T>(key: string, fallback: T): T {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch {
        return fallback;
    }
}

const DC = (s: string) =>
    ({ 'Inception':'#94a3b8', 'Dev/Unit test':'#6366f1', 'Testing':'#f59e0b' }[s] ?? '#94a3b8');

export const useDayStore = defineStore('day', () => {
    const usToday  = ref<UsCard[]>([
        ...US_TODAY_DEFAULT.map(u => ({ ...u })),
        ...loadJson<UsCard[]>('portal_us_extra', []),
    ]);
    const tlEvents = ref(TL_EVENTS);
    const emails   = ref(EMAILS);
    const usNotes  = ref<Record<number, string>>(loadJson('portal_us_notes', {}));

    watch(usNotes, val => localStorage.setItem('portal_us_notes', JSON.stringify(val)), { deep: true });

    function persistExtra() {
        const extra = usToday.value.filter(u => !US_TODAY_DEFAULT.some(d => d.tpId === u.tpId));
        localStorage.setItem('portal_us_extra', JSON.stringify(extra));
    }

    const quickLog = computed<UsCard[]>(() => {
        const inToday = new Set(usToday.value.map(u => u.tpId));
        return [...TS_ACTIVE, ...TS_PINNED]
            .filter(r => !inToday.has(r.tpId))
            .map(r => ({
                us: r.us, tpId: r.tpId, state: r.state,
                tpHours: 0, zucHours: 7.5,
                emails: 0, commits: r.git?.[4] ?? 0, meetings: 0,
                color: DC(r.state), note: '',
                totAllTime: r.totAllTime,
                rem: r.rem,
            } as UsCard & { totAllTime: number; rem?: number }));
    });

    function addToWorkToday(tpId: number) {
        if (usToday.value.some(u => u.tpId === tpId)) return;
        const src = [...TS_ACTIVE, ...TS_PINNED].find(r => r.tpId === tpId);
        if (!src) return;
        usToday.value.push({
            us: src.us, tpId: src.tpId, state: src.state,
            tpHours: 0, zucHours: 7.5,
            emails: 0, commits: 0, meetings: 0,
            color: DC(src.state), note: '',
        });
        persistExtra();
    }

    function setUsNote(tpId: number, text: string) {
        usNotes.value[tpId] = text;
    }

    function setTpHours(tpId: number, val: number) {
        const u = usToday.value.find(x => x.tpId === tpId);
        if (u) u.tpHours = Math.max(0, +val.toFixed(1));
    }

    const dayTotals = computed(() => {
        const tp  = +usToday.value.reduce((a, u) => a + u.tpHours, 0).toFixed(1);
        const zuc = 7.5;
        return { tp, zuc, delta: +(zuc - tp).toFixed(1) };
    });

    return {
        usToday, tlEvents, emails, usNotes,
        quickLog, dayTotals,
        addToWorkToday, setUsNote, setTpHours,
    };
});
