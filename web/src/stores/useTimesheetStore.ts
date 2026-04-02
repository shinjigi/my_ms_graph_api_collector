import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  fetchWeek,
  fetchTpWeekHours,
  submitWeekHours as submitWeekHoursApi,
} from "../api";
import type {
  Day,
  TsRow,
  ApiWeekResponse,
  SubmitEdit,
  WeekDayResponse,
} from "../types";
import { useAnalysisStore } from "./useAnalysisStore";
import {
  dateToString,
  DAYABB_IT,
  shiftDate,
  formatShortDateLabel,
} from "@shared/dates";

export const useTimesheetStore = defineStore(
  "timesheet",
  () => {
    // --- State ---
    const days = ref<Day[]>([]);
    const allTasks = ref<TsRow[]>([]);
    const usExtra = ref<TsRow[]>([]); // manual extra tasks
    const loading = ref(false);
    const error = ref<string | null>(null);
    const weekData = ref<ApiWeekResponse | null>(null);
    const currentMonday = ref<string>("");

    // Draft edits (persisted)
    const hoursEdits = ref<Record<string, number>>({});
    const noteEdits = ref<Record<string, string>>({});

    // Promotion timers (moving a task from pinned to active)
    const pendingPromotion = ref<number[]>([]);
    const promotionTimers = new Map<number, ReturnType<typeof setTimeout>>();

    // --- Computed ---
    
    /** Unified list of all tasks (standard + extras) */
    const allRowsFlattened = computed(() => [...allTasks.value, ...usExtra.value]);

    const isRowActive = (r: TsRow) => {
      // 1. Check local edits
      for (let i = 0; i < 5; i++) {
        if (hoursEdits.value[`${r.tpId}_${i}`] > 0) return true;
      }
      // 2. Check server hours
      if ((r.hours as number[]).slice(0, 5).some((h) => h > 0)) return true;
      
      // 3. Check AI hints
      if (currentMonday.value) {
        for (let i = 0; i < 5; i++) {
          const hint = useAnalysisStore().getHint(r.tpId, i, currentMonday.value);
          if (hint && hint.inferredHours > 0) return true;
        }
      }
      return false;
    };

    const active = computed(() => allRowsFlattened.value.filter(isRowActive));
    const pinned = computed(() => allRowsFlattened.value.filter((r) => !isRowActive(r)));

    const totalsRow = computed(() => {
      const tp = days.value.map((_, i) =>
        +allRowsFlattened.value.reduce((acc, r) => acc + getHours(r.tpId, i), 0).toFixed(1),
      );
      const zuc = days.value.map((d) => d.zucHours);
      const delta = tp.map((t, i) => +((zuc[i] ?? 0) - t).toFixed(1));
      return { tp, zuc, delta };
    });

    const rendPerDay = computed<Array<"ok" | "warn" | "err" | null>>(() =>
      days.value.map((d, i) => {
        if (d.holiday || i >= 5 || d.zucHours === 0) return null;
        const delta = totalsRow.value.delta[i];
        if (Math.abs(delta) < 0.05) return "ok";
        return totalsRow.value.tp[i] === 0 ? "err" : "warn";
      }),
    );

    /**
     * Single Source of Truth for pending actions.
     * Union of manual Edits and AI Hints.
     */
    const pendingSubmissions = computed((): (SubmitEdit & { isHint: boolean, usName: string, status?: string })[] => {
      const monday = currentMonday.value;
      if (!monday) return [];

      const result: any[] = [];
      for (let i = 0; i < 5; i++) {
        const date = shiftDate(monday, i);
        for (const row of allRowsFlattened.value) {
          const key = `${row.tpId}_${i}`;
          const hasManual = key in hoursEdits.value;
          const serverHours = row.hours?.[i] ?? 0;

          let targetHours = 0, description = "", isHint = false, status = "";

          if (hasManual) {
            targetHours = hoursEdits.value[key];
            description = getNote(row.tpId, i);
          } else {
            const hint = useAnalysisStore().getHint(row.tpId, i, monday);
            // Ignore if no hint, if it was already applied, or if it matched TP already
            if (!hint || hint.inferredHours <= 0 || hint.status === 'applied') continue;
            
            targetHours = hint.inferredHours;
            description = hint.comment || "";
            isHint = true;
            status = hint.status || 'suggested';
          }

          if (targetHours <= 0) continue;
          
          // Filter out if it matches server state (0.05 tolerance)
          if (Math.abs(targetHours - serverHours) < 0.05) continue;

          result.push({
            tpId: row.tpId, dayIdx: i, hours: targetHours, date, 
            description, isHint, usName: row.us, status
          });
        }
      }
      return result;
    });

    // --- Actions ---

    async function fetchWeekData(date: string, force = false) {
      if (!force && currentMonday.value === date && weekData.value) return;
      loading.value = true;
      try {
        const [weekRes, tpData] = await Promise.all([fetchWeek(date), fetchTpWeekHours(date)]);
        if (currentMonday.value && currentMonday.value !== weekRes.monday) clearEdits();
        currentMonday.value = weekRes.monday;

        days.value = weekRes.days.map((d, i) => ({
          label: DAYABB_IT[[1, 2, 3, 4, 5, 6, 0][i] % 7] ?? "?",
          date: formatShortDateLabel(d.date), rend: null, zucHours: d.oreTarget,
          location: d.location, nibol: d.nibol, holiday: d.holiday, holidayName: d.holidayName,
        }));

        allTasks.value = tpData.entries.map((e: any) => ({
          project: e.projectName, us: e.usName, tpId: e.tpId, state: e.stateName,
          totAllTime: e.timeSpent, hours: [...e.hours, 0, 0], 
          notes: [...(e.notes ?? [null, null, null, null, null]), null, null],
          git: Array.from({ length: 7 }, () => 0), svn: Array.from({ length: 7 }, () => 0),
        }));

        weekData.value = weekRes;
      } finally {
        loading.value = false;
      }
    }

    function getHours(tpId: number, dayIdx: number): number {
      const key = `${tpId}_${dayIdx}`;
      if (key in hoursEdits.value) return hoursEdits.value[key];
      return allRowsFlattened.value.find(r => r.tpId === tpId)?.hours?.[dayIdx] ?? 0;
    }

    function getNote(tpId: number, dayIdx: number): string {
      const key = `${tpId}_${dayIdx}`;
      if (key in noteEdits.value) return noteEdits.value[key];
      return allRowsFlattened.value.find(r => r.tpId === tpId)?.notes?.[dayIdx] ?? "";
    }

    function setHours(tpId: number, dayIdx: number, val: number) {
      hoursEdits.value[`${tpId}_${dayIdx}`] = Math.max(0, +val.toFixed(1));
    }

    function setNote(tpId: number, dayIdx: number, text: string) {
      noteEdits.value[`${tpId}_${dayIdx}`] = text;
    }

    function clearEdits() {
      hoursEdits.value = {};
      noteEdits.value = {};
    }

    async function submitWeekHours() {
      const edits = pendingSubmissions.value;
      const result = await submitWeekHoursApi(currentMonday.value, edits);
      
      // Cleanup successful edits from local draft
      const failedKeys = new Set(result.errors.map((e: any) => `${e.tpId}_${edits.find(x => x.tpId === e.tpId && x.date === e.date)?.dayIdx}`));
      edits.forEach(e => {
        const key = `${e.tpId}_${e.dayIdx}`;
        if (failedKeys.has(key)) return;
        delete hoursEdits.value[key];
        delete noteEdits.value[key];
      });

      if (result.errors.length === 0) {
        useAnalysisStore().clearWeekHints();
        await new Promise(r => setTimeout(r, 500));
        await fetchWeekData(currentMonday.value, true);
      }
      return result;
    }

    async function submitDayHours(dayIdx: number) {
      const edits = pendingSubmissions.value.filter(e => e.dayIdx === dayIdx);
      const result = await submitWeekHoursApi(currentMonday.value, edits);
      const failed = new Set(result.errors.map((e: any) => `${e.tpId}_${dayIdx}`));
      edits.forEach(e => {
        const key = `${e.tpId}_${dayIdx}`;
        if (!failed.has(key)) {
            delete hoursEdits.value[key];
            delete noteEdits.value[key];
        }
      });
      if (result.errors.length === 0) {
        useAnalysisStore().clearDayHints(dayIdx, currentMonday.value);
        await new Promise(r => setTimeout(r, 500));
        await fetchWeekData(currentMonday.value, true);
      }
      return result;
    }

    function schedulePromotion(tpId: number) {
      if (promotionTimers.has(tpId)) clearTimeout(promotionTimers.get(tpId)!);
      if (!pendingPromotion.value.includes(tpId)) pendingPromotion.value.push(tpId);
      promotionTimers.set(tpId, setTimeout(() => {
        promotionTimers.delete(tpId);
        pendingPromotion.value = pendingPromotion.value.filter(id => id !== tpId);
      }, 2000));
    }

    return {
      days, loading, error, weekData, currentMonday, hoursEdits, noteEdits, 
      active, pinned, pendingPromotion, pendingSubmissions, totalsRow, rendPerDay,
      fetchWeekData, getHours, getNote, setHours, setNote, clearEdits,
      submitWeekHours, submitDayHours, schedulePromotion,
      allTasks, usExtra
    };
  },
  {
    persist: [
      { key: "portal_hours", pick: ["hoursEdits"] },
      { key: "portal_ts_notes", pick: ["noteEdits"] },
      { key: "portal_us_extra", pick: ["usExtra"] },
    ],
  },
);
