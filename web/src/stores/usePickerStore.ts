import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { findHoliday } from "@shared/holidays";

interface PickerDay {
    date: Date;
    num: number;
    abbr: string;
    isToday: boolean;
    isSelected: boolean;
    isWeekend: boolean;
    isHoliday: boolean;
    holidayName: string;
}

import {
    todayMidnight,
    dateToString,
    getMonday,
    shiftDate,
    getDayOfWeek,
    startOfMonth,
    formatMonthYearLabel,
    getYearMonth,
    getDaysInMonth,
    addMonths,
    isSameDay,
} from "@shared/dates";

export const usePickerStore = defineStore(
    "picker",
    () => {
        const router = useRouter();

        const today = todayMidnight();
        const pickerToday = ref<Date>(today);
        const pickerSelected = ref<Date>(todayMidnight());
        /** 
         * Currently displayed month in the picker. Kept as a ref (instead of computed 
         * from pickerSelected) to allow browsing months without changing the selection.
         */
        const pickerMonth = ref<Date>(startOfMonth(today));

        const monthLabel = computed(() => formatMonthYearLabel(pickerMonth.value));

        const daysInMonth = computed<PickerDay[]>(() => {
            const { year, month } = getYearMonth(pickerMonth.value);
            const count = getDaysInMonth(year, month);
            const result: PickerDay[] = [];
            for (let d = 1; d <= count; d++) {
                const date = new Date(year, month - 1, d);
                const dow = date.getDay();
                const holiday = findHoliday(date);

                result.push({
                    date,
                    num: d,
                    abbr: getDayOfWeek(date),
                    isToday: isSameDay(date, pickerToday.value),
                    isSelected: isSameDay(date, pickerSelected.value),
                    isWeekend: dow === 0 || dow === 6,
                    isHoliday: !!holiday,
                    holidayName: holiday?.name ?? "",
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
            const monday = getMonday(pickerSelected.value);
            for (let i = 0; i < 5; i++) {
                if (isSameDay(shiftDate(monday, i), pickerToday.value)) return i;
            }
            return -1;
        });

        /**
         * Navigate to a specific day: pushes the new URL.
         * The PortalView route watch updates picker state from the URL.
         */
        function selectDay(yr: number, mo: number, d: number) {
            const dateStr = dateToString(new Date(yr, mo, d));
            const view = router.currentRoute.value.path.split('/')[1] || 'dashboard';
            router.push(`/${view}/${dateStr}`);
        }

        /** Silent update from router — does NOT push to history. */
        function setFromDate(date: Date) {
            pickerSelected.value = date;
            pickerMonth.value = startOfMonth(date);
        }

        function prevMonth() {
            pickerMonth.value = addMonths(pickerMonth.value, -1);
        }

        function nextMonth() {
            pickerMonth.value = addMonths(pickerMonth.value, 1);
        }

        function goToday() {
            const today = dateToString(pickerToday.value);
            const view = router.currentRoute.value.path.split('/')[1] || 'dashboard';
            router.push(`/${view}/${today}`);
        }

        function prevWeek() {
            const prev = shiftDate(pickerSelected.value, -7);
            selectDay(prev.getFullYear(), prev.getMonth(), prev.getDate());
        }

        function nextWeek() {
            const next = shiftDate(pickerSelected.value, 7);
            selectDay(next.getFullYear(), next.getMonth(), next.getDate());
        }

        return {
            pickerToday,
            pickerSelected,
            pickerMonth,
            monthLabel,
            daysInMonth,
            selectedDayIdx,
            todayDayIdx,
            selectDay,
            setFromDate,
            prevMonth,
            nextMonth,
            goToday,
            prevWeek,
            nextWeek,
        };
    },
    {
        persist: {
            key: "picker.selection",
            pick: ["pickerSelected", "pickerMonth"],
            serializer: {
                serialize: (s: Record<string, unknown>) =>
                    JSON.stringify({
                        pickerSelected: (s["pickerSelected"] as Date).toISOString(),
                        pickerMonth: (s["pickerMonth"] as Date).toISOString(),
                    }),
                deserialize: (raw: string) => {
                    const p = JSON.parse(raw) as {
                        pickerSelected: string;
                        pickerMonth: string;
                    };
                    return {
                        pickerSelected: new Date(p.pickerSelected),
                        pickerMonth: new Date(p.pickerMonth),
                    };
                },
            },
        },
    },
);
