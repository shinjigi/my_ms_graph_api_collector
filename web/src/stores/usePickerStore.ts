import { defineStore }  from 'pinia';
import { ref, computed } from 'vue';
import { useRouter }     from 'vue-router';
import { HOLIDAYS_IT, MONTH_IT, DAYABB_IT } from '../mock/data';
import { useUiStore }      from './useUiStore';

interface PickerDay {
    date:       Date;
    num:        number;
    abbr:       string;
    isToday:    boolean;
    isSelected: boolean;
    isWeekend:  boolean;
    isHoliday:  boolean;
    holidayName:string;
}

function todayMidnight(): Date {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function localDateStr(d: Date): string {
    const yr  = d.getFullYear();
    const mo  = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${day}`;
}

export const usePickerStore = defineStore('picker', () => {
    const router = useRouter();

    const today          = todayMidnight();
    const pickerToday    = ref<Date>(today);
    const pickerSelected = ref<Date>(todayMidnight());
    const pickerMonth    = ref<Date>(new Date(today.getFullYear(), today.getMonth(), 1));

    const monthLabel = computed(() =>
        `${MONTH_IT[pickerMonth.value.getMonth()]} ${pickerMonth.value.getFullYear()}`
    );

    const daysInMonth = computed<PickerDay[]>(() => {
        const yr = pickerMonth.value.getFullYear();
        const mo = pickerMonth.value.getMonth();
        const count = new Date(yr, mo + 1, 0).getDate();
        const result: PickerDay[] = [];
        for (let d = 1; d <= count; d++) {
            const date     = new Date(yr, mo, d);
            const dow      = date.getDay();
            const holiday  = HOLIDAYS_IT.find(h => h.m === mo && h.d === d);
            result.push({
                date,
                num:        d,
                abbr:       DAYABB_IT[dow],
                isToday:    date.toDateString() === pickerToday.value.toDateString(),
                isSelected: date.toDateString() === pickerSelected.value.toDateString(),
                isWeekend:  dow === 0 || dow === 6,
                isHoliday:  !!holiday,
                holidayName:holiday?.name ?? '',
            });
        }
        return result;
    });

    // 0=Mon … 4=Fri, -1=weekend/not-in-week
    const selectedDayIdx = computed<number>(() => {
        const dow = pickerSelected.value.getDay();
        if (dow === 0 || dow === 6) return -1;
        return dow - 1;
    });

    // Column index (0-4) of pickerToday in the currently displayed week, or -1.
    const todayDayIdx = computed<number>(() => {
        const sel = pickerSelected.value;
        const dow = sel.getDay();
        const monday = new Date(sel);
        monday.setDate(sel.getDate() - (dow === 0 ? 6 : dow - 1));
        for (let i = 0; i < 5; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            if (d.toDateString() === pickerToday.value.toDateString()) return i;
        }
        return -1;
    });

    /**
     * Navigate to a specific day: pushes the new URL.
     * The PortalView route watch updates picker state from the URL.
     */
    function selectDay(yr: number, mo: number, d: number) {
        const dateStr = `${yr}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const ui = useUiStore();
        router.push(`/${ui.activeView}/${dateStr}`);
    }

    /** Silent update from router — does NOT push to history. */
    function setFromDate(date: Date) {
        pickerSelected.value = date;
        pickerMonth.value    = new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function prevMonth() {
        const m = pickerMonth.value;
        pickerMonth.value = new Date(m.getFullYear(), m.getMonth() - 1, 1);
    }

    function nextMonth() {
        const m = pickerMonth.value;
        pickerMonth.value = new Date(m.getFullYear(), m.getMonth() + 1, 1);
    }

    function goToday() {
        const today = localDateStr(pickerToday.value);
        const ui = useUiStore();
        router.push(`/${ui.activeView}/${today}`);
    }

    return {
        pickerToday, pickerSelected, pickerMonth,
        monthLabel, daysInMonth, selectedDayIdx, todayDayIdx,
        selectDay, setFromDate, prevMonth, nextMonth, goToday,
    };
}, {
    persist: {
        key:  'portal_picker',
        pick: ['pickerSelected', 'pickerMonth'],
        serializer: {
            serialize: (s: Record<string, unknown>) => JSON.stringify({
                pickerSelected: (s['pickerSelected'] as Date).toISOString(),
                pickerMonth:    (s['pickerMonth']    as Date).toISOString(),
            }),
            deserialize: (raw: string) => {
                const p = JSON.parse(raw) as { pickerSelected: string; pickerMonth: string };
                return {
                    pickerSelected: new Date(p.pickerSelected),
                    pickerMonth:    new Date(p.pickerMonth),
                };
            },
        },
    },
});
