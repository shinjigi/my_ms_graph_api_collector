import { defineStore }  from 'pinia';
import { ref, computed } from 'vue';
import { HOLIDAYS_IT, MONTH_IT, DAYABB_IT } from '../mock/data';

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

const PICKER_TODAY = new Date(2026, 2, 16);

function loadPersisted(): { selectedDay: string; month: string } | null {
    try {
        const raw = localStorage.getItem('portal_picker');
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
}

export const usePickerStore = defineStore('picker', () => {
    const persisted = loadPersisted();

    const pickerToday    = ref<Date>(PICKER_TODAY);
    const pickerSelected = ref<Date>(
        persisted?.selectedDay ? new Date(persisted.selectedDay) : new Date(2026, 2, 13)
    );
    const pickerMonth    = ref<Date>(
        persisted?.month ? new Date(persisted.month) : new Date(2026, 2, 1)
    );

    function persist() {
        localStorage.setItem('portal_picker', JSON.stringify({
            selectedDay: pickerSelected.value.toISOString(),
            month:       pickerMonth.value.toISOString(),
        }));
    }

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

    // 0=Mon … 4=Fri, -1=weekend
    const selectedDayIdx = computed<number>(() => {
        const dow = pickerSelected.value.getDay();
        if (dow === 0 || dow === 6) return -1;
        return dow - 1;
    });

    function selectDay(yr: number, mo: number, d: number) {
        pickerSelected.value = new Date(yr, mo, d);
        pickerMonth.value    = new Date(yr, mo, 1);
        persist();
    }

    function prevMonth() {
        const m = pickerMonth.value;
        pickerMonth.value = new Date(m.getFullYear(), m.getMonth() - 1, 1);
        persist();
    }

    function nextMonth() {
        const m = pickerMonth.value;
        pickerMonth.value = new Date(m.getFullYear(), m.getMonth() + 1, 1);
        persist();
    }

    function goToday() {
        pickerSelected.value = new Date(pickerToday.value);
        pickerMonth.value    = new Date(pickerToday.value.getFullYear(), pickerToday.value.getMonth(), 1);
        persist();
    }

    return {
        pickerToday, pickerSelected, pickerMonth,
        monthLabel, daysInMonth, selectedDayIdx,
        selectDay, prevMonth, nextMonth, goToday,
    };
});
