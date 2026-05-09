import { computed } from 'vue';
import { useTimesheetStore } from '../stores/useTimesheetStore';
import { usePickerStore } from '../stores/usePickerStore';
import { isSameDay, isFuture } from '@shared/dates';
import type { DayStatus } from '../types';

export function useDayStatus() {
    const ts = useTimesheetStore();
    const picker = usePickerStore();

    /** Checks if a day (0-6) is the current today */
    const isToday = (idx: number) => {
        const dayDate = ts.weekData?.days[idx]?.date;
        return dayDate ? isSameDay(new Date(dayDate), picker.pickerToday) : false;
    };

    /** Checks if a day (0-6) is the selected day in picker */
    const isSelected = (idx: number) => {
        const dayDate = ts.weekData?.days[idx]?.date;
        return dayDate ? isSameDay(new Date(dayDate), picker.pickerSelected) : false;
    };

    /** Returns the sync status for a day (Mon-Fri) */
    const getStatus = (idx: number): DayStatus => {
        const d = ts.days[idx];
        if (!d || idx >= 5) return null;

        if (d.holiday) {
            // Absence day with TP hours logged = error
            if (d.holidayType === 'absence' && ts.totalsRow.tp[idx] > 0) return 'err';
            return 'skip';
        }

        if (d.zucHours === 0 && ts.totalsRow.tp[idx] === 0) return 'skip';

        // Skip future days — no color indicator until the day has passed (or is today)
        const dayDate = ts.weekData?.days[idx]?.date;
        if (dayDate && isFuture(dayDate)) return null;

        const delta = ts.totalsRow.delta[idx];
        const tp = ts.totalsRow.tp[idx];

        if (Math.abs(delta) < 0.05) return 'ok';
        if (tp === 0) return 'err';
        if (delta < 0) return 'over';
        return 'warn';
    };

    /** Returns standard CSS classes for a day column */
    const getDayColCls = (idx: number) => {
        const d = ts.days[idx];
        const cls: string[] = [];
        if (!d) return cls;

        // 1. Holiday status
        if (d.holiday) {
            cls.push(d.holidayType === 'absence' ? 'absence-col' : 'holiday-col');
        }

        // 2. Health status (only for workdays or problematic absences)
        const status = getStatus(idx);
        if (status === 'ok') cls.push('day-ok');
        if (status === 'warn' || status === 'over') cls.push('day-warn');
        if (status === 'err') cls.push('day-err');

        // 3. Temporal highlighting
        if (isToday(idx)) cls.push('today-col');
        if (isSelected(idx)) cls.push('selected-col');

        return cls;
    };

    return {
        isToday,
        isSelected,
        getStatus,
        getDayColCls,
        // Global week health
        isWeekOk: computed(() => ts.days.slice(0, 5).every((_, i) => {
            const s = getStatus(i);
            return s === 'ok' || s === 'skip' || s === null;
        }))
    };
}
