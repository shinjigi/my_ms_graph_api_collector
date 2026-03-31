import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { useUiStore } from "./useUiStore";
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

import { todayMidnight, dateToString, getMonday, shiftDate, DAYABB_IT, MONTH_IT } from "@shared/dates";

export const usePickerStore = defineStore(
  "picker",
  () => {
    const router = useRouter();

    const today = todayMidnight();
    const pickerToday = ref<Date>(today);
    const pickerSelected = ref<Date>(todayMidnight());
    const pickerMonth = ref<Date>(
      new Date(today.getFullYear(), today.getMonth(), 1),
    );

    const monthLabel = computed(
      () =>
        `${MONTH_IT[pickerMonth.value.getMonth()]} ${pickerMonth.value.getFullYear()}`,
    );

    const daysInMonth = computed<PickerDay[]>(() => {
      const yr = pickerMonth.value.getFullYear();
      const mo = pickerMonth.value.getMonth();
      const count = new Date(yr, mo + 1, 0).getDate();
      const result: PickerDay[] = [];
      for (let d = 1; d <= count; d++) {
        const date = new Date(yr, mo, d);
        const dow = date.getDay();
        const holiday = findHoliday(date);

        result.push({
          date,
          num: d,
          abbr: DAYABB_IT[dow],
          isToday: date.toDateString() === pickerToday.value.toDateString(),
          isSelected:
            date.toDateString() === pickerSelected.value.toDateString(),
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
      const todayStr = dateToString(pickerToday.value);
      for (let i = 0; i < 5; i++) {
        if (shiftDate(monday, i) === todayStr) return i;
      }
      return -1;
    });

    /**
     * Navigate to a specific day: pushes the new URL.
     * The PortalView route watch updates picker state from the URL.
     */
    function selectDay(yr: number, mo: number, d: number) {
      const dateStr = dateToString(new Date(yr, mo, d));
      const ui = useUiStore();
      router.push(`/${ui.activeView}/${dateStr}`);
    }

    /** Silent update from router — does NOT push to history. */
    function setFromDate(date: Date) {
      pickerSelected.value = date;
      pickerMonth.value = new Date(date.getFullYear(), date.getMonth(), 1);
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
      const today = dateToString(pickerToday.value);
      const ui = useUiStore();
      router.push(`/${ui.activeView}/${today}`);
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
    };
  },
  {
    persist: {
      key: "portal_picker",
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
