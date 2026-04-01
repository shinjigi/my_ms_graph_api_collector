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
  DayProposal,
} from "../types";
import { useAnalysisStore } from "./useAnalysisStore";
import {
  dateToString,
  DAYABB_IT,
  parseDateString,
  shiftDate,
  formatShortDateLabel,
} from "@shared/dates";

export const useTimesheetStore = defineStore(
  "timesheet",
  () => {
    const days = ref<Day[]>([]);
    const allTasks = ref<TsRow[]>([]);
    const usExtra = ref<TsRow[]>([]); 

    const analysis = useAnalysisStore();

    /** Partition rows: Active (has hours, local edits or AI hints) vs Pinned (empty) */
    const isRowActive = (r: TsRow) => {
      // 1. Check local edits
      for (let i = 0; i < 5; i++) {
        if (hoursEdits.value[`${r.tpId}_${i}`] > 0) return true;
      }
      // 2. Check server hours
      if ((r.hours as number[]).slice(0, 5).some((h) => h > 0)) return true;
      
      // 3. Check AI hints (promote them to main table automatically)
      if (currentMonday.value) {
        for (let i = 0; i < 5; i++) {
          const hint = analysis.getHint(r.tpId, i, currentMonday.value);
          if (hint && hint.inferredHours > 0) return true;
        }
      }
      return false;
    };

    const active = computed(() => allTasks.value.filter(isRowActive));
    const pinned = computed(() => allTasks.value.filter((r) => !isRowActive(r)));

    const loading = ref(false);
    const error = ref<string | null>(null);
    const weekData = ref<ApiWeekResponse | null>(null);
    const currentMonday = ref<string>("");

    const hoursEdits = ref<Record<string, number>>({});
    const noteEdits = ref<Record<string, string>>({});

    // tpIds of pinned rows with a pending promotion timer
    const pendingPromotion = ref<number[]>([]);
    const promotionTimers = new Map<number, ReturnType<typeof setTimeout>>();

    /**
     * Fetch week data from backend and populate days/active/pinned.
     * Falls back to mock data if backend is unavailable.
     */
    async function fetchWeekData(date: string, force = false): Promise<void> {
      if (!force && currentMonday.value === date && weekData.value) return;

      loading.value = true;
      error.value = null;

      try {
        const [weekRes, tpData] = await Promise.all([
          fetchWeek(date),
          fetchTpWeekHours(date),
        ]);

        currentMonday.value = weekRes.monday;
        console.log(
          "[TS] fetchWeekData:",
          date,
          "monday:",
          weekRes.monday,
          "days:",
          weekRes.days.map((d) => d.date),
        );

        // Map week response to Day[]
        days.value = weekRes.days.map((d, idx) => {
          const dow = idx; // 0=Mon...6=Sun
          const dayLabel = DAYABB_IT[[1, 2, 3, 4, 5, 6, 0][dow] % 7] ?? "?";
          const dateLabel = formatShortDateLabel(d.date);

          return {
            label: dayLabel,
            date: dateLabel,
            rend: null, // computed by rendPerDay
            zucHours: d.oreTarget,
            location: d.location,
            nibol: d.nibol,
            holiday: d.holiday,
            holidayName: d.holidayName,
          };
        });
        console.log(
          "[TS] days mapped:",
          days.value.map((d) => d.date),
        );

        // Count VCS commits per task per day by parsing "#XXXXXX" refs in commit messages
        const taskIdRe = /#(\d{5,6})\b/g;
        const gitCounts = new Map<string, number>(); // key: "tpId_dayIdx"
        const svnCounts = new Map<string, number>();
        weekRes.days.forEach((d, di) => {
          for (const c of d.gitCommits ?? []) {
            for (const m of [...c.message.matchAll(taskIdRe)]) {
              const k = `${m[1]}_${di}`;
              gitCounts.set(k, (gitCounts.get(k) ?? 0) + 1);
            }
          }
          for (const c of d.svnCommits ?? []) {
            for (const m of [...c.message.matchAll(taskIdRe)]) {
              const k = `${m[1]}_${di}`;
              svnCounts.set(k, (svnCounts.get(k) ?? 0) + 1);
            }
          }
        });

        // Map entries to rows; split active (has hours this week) vs pinned (no hours yet)
        const allRows = tpData.entries.map((e: any) => ({
          project: e.projectName,
          us: e.usName,
          tpId: e.tpId,
          state: e.stateName,
          totAllTime: e.timeSpent,
          hours: [...e.hours, 0, 0], // Pad to 7 (Mon-Sun)
          notes: [...(e.notes ?? [null, null, null, null, null]), null, null], // Pad to 7
          git: Array.from(
            { length: 7 },
            (_, i) => gitCounts.get(`${e.tpId}_${i}`) ?? 0,
          ),
          svn: Array.from(
            { length: 7 },
            (_, i) => svnCounts.get(`${e.tpId}_${i}`) ?? 0,
          ),
        }));

        allTasks.value = allRows;

        // Set weekData last — triggers useDayStore watcher after active/pinned are populated
        weekData.value = weekRes;
      } catch (err) {
        console.warn(
          "fetchWeekData failed, falling back to mock data:",
          (err as Error).message,
        );
        // Keep existing mock data
      } finally {
        loading.value = false;
      }
    }

    function getHours(tpId: number, dayIdx: number): number {
      const key = `${tpId}_${dayIdx}`;
      if (key in hoursEdits.value) return hoursEdits.value[key];
      const row = [...active.value, ...pinned.value].find(
        (r) => r.tpId === tpId,
      );
      return row?.hours?.[dayIdx] ?? 0;
    }

    function getNote(tpId: number, dayIdx: number): string {
      const key = `${tpId}_${dayIdx}`;
      if (key in noteEdits.value) return noteEdits.value[key];
      const row = [...active.value, ...pinned.value].find(
        (r) => r.tpId === tpId,
      );
      return row?.notes?.[dayIdx] ?? "";
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
        tasks.forEach((r) => setHours(r.tpId, dayIdx, 0));
        return;
      }

      const totalWeight = tasks.reduce(
        (sum, r) => sum + Math.max(r.totAllTime ?? 1, 1),
        0,
      );
      let assigned = 0;
      tasks.forEach((r, i) => {
        if (i === tasks.length - 1) {
          setHours(
            r.tpId,
            dayIdx,
            +Math.max(0, totalHours - assigned).toFixed(1),
          );
        } else {
          const rounded =
            Math.round(
              ((totalHours * Math.max(r.totAllTime ?? 1, 1)) / totalWeight) * 2,
            ) / 2;
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
      d.location = update.location;
      d.holiday = update.holiday ?? !update.isWorkday;
      d.nibol = update.nibol;
      if (weekData.value?.days?.[dayIdx]) {
        weekData.value.days[dayIdx] = update;
      }
    }

    const totalsRow = computed(() => {
      const allRows = [...active.value, ...pinned.value];
      const tp = days.value.map((_, i) =>
        +allRows.reduce((acc, r) => acc + getHours(r.tpId, i), 0).toFixed(1),
      );
      const zuc = days.value.map((d) => d.zucHours);
      const delta = tp.map((t, i) => +((zuc[i] ?? 0) - t).toFixed(1));
      return { tp, zuc, delta };
    });

    // Reactive rend status per day, derived from actual TP vs Zucchetti hours.
    const rendPerDay = computed<Array<"ok" | "warn" | "err" | null>>(() =>
      days.value.map((d, i) => {
        if (d.holiday || i >= 5) return null;
        if (d.zucHours === 0) return null;
        const delta = totalsRow.value.delta[i];
        const tp = totalsRow.value.tp[i];
        if (Math.abs(delta) < 0.05) return "ok";
        if (tp === 0) return "err";
        return "warn";
      }),
    );

    /**
     * Schedules promotion of a pinned row to the active table after a 2s debounce.
     * Multiple quick clicks reset the timer, allowing the user to accumulate hours
     * (e.g. three clicks → 1.5h) before the row moves up.
     */
    function schedulePromotion(tpId: number) {
      if (promotionTimers.has(tpId)) clearTimeout(promotionTimers.get(tpId)!);
      if (!pendingPromotion.value.includes(tpId)) {
        pendingPromotion.value = [...pendingPromotion.value, tpId];
      }

      const timer = setTimeout(() => {
        promotionTimers.delete(tpId);
        pendingPromotion.value = pendingPromotion.value.filter(
          (id) => id !== tpId,
        );

        // Check if it's still in pinned
        const idx = pinned.value.findIndex((r) => r.tpId === tpId);
        if (idx === -1) return;

        // Move to active
        const [row] = pinned.value.splice(idx, 1);
        active.value.push(row);
      }, 2000);
      promotionTimers.set(tpId, timer);
    }

    function clearEdits() {
      hoursEdits.value = {};
      noteEdits.value = {};
    }

    function addExtraTask(name: string, dayIdx: number) {
      const tpId = Math.floor(Math.random() * 1000000) + 9000000; // 9M range for extras
      usExtra.value.push({
        project: "Extra",
        us: name,
        tpId,
        state: "Inception",
        totAllTime: 0,
        hours: [0, 0, 0, 0, 0, 0, 0],
        notes: [null, null, null, null, null, null, null],
        git: [0, 0, 0, 0, 0, 0, 0],
        svn: [0, 0, 0, 0, 0, 0, 0],
      });
      setHours(tpId, dayIdx, 0.5);
      return tpId;
    }

    function removeExtraTask(tpId: number) {
      usExtra.value = usExtra.value.filter((t) => t.tpId !== tpId);
      // Clear its edits
      [0, 1, 2, 3, 4, 5, 6].forEach((i) => {
        delete hoursEdits.value[`${tpId}_${i}`];
        delete noteEdits.value[`${tpId}_${i}`];
      });
    }

    function buildEdits(filterDayIdx?: number): SubmitEdit[] {
      const monday = currentMonday.value;
      if (!monday) return [];
      const edits: SubmitEdit[] = [];
      for (const [key, hours] of Object.entries(hoursEdits.value)) {
        if (!hours || hours <= 0) continue;
        const [tpIdStr, dayIdxStr] = key.split("_");
        const tpId = Number(tpIdStr);
        const dayIdx = Number(dayIdxStr);
        if (dayIdx < 0 || dayIdx > 4) continue;
        if (filterDayIdx !== undefined && dayIdx !== filterDayIdx) continue;

        const date = shiftDate(monday, dayIdx);

        edits.push({
          tpId,
          dayIdx,
          hours,
          date,
          description: getNote(tpId, dayIdx),
        });
      }
      return edits;
    }

    /**
     * Bulk-submits all hoursEdits to TargetProcess.
     * On full success, clears edits and reloads week data.
     * Returns { submitted, errors } from the API.
     */
    async function submitWeekHours(): Promise<{
      submitted: number;
      errors: unknown[];
    }> {
      const monday = currentMonday.value;
      if (!monday) throw new Error("No week loaded");

      const edits = buildEdits();
      const result = await submitWeekHoursApi(monday, edits);
      if (result.errors.length === 0) {
        // Optimistic update: merge submitted edits into local rows immediately
        // so cells don't "go blank" during the indexing delay on TP side.
        edits.forEach((e) => {
          const row = [...active.value, ...pinned.value].find(
            (r) => r.tpId === e.tpId,
          );
          if (row) {
            if (!row.hours) row.hours = [0, 0, 0, 0, 0, 0, 0];
            row.hours[e.dayIdx] = e.hours;
            if (!row.notes) row.notes = [];
            row.notes[e.dayIdx] = e.description || null;
          }
        });

        clearEdits();
        useAnalysisStore().clearWeekHints();
        // Give TP a moment to index the new entries before we re-fetch
        await new Promise((r) => setTimeout(r, 500));
        await fetchWeekData(monday, true);
      }
      return result;
    }

    /**
     * Submits only the edits for a single day (0=Mon … 4=Fri).
     * On full success, clears that day's edits and reloads week data.
     */
    async function submitDayHours(
      dayIdx: number,
    ): Promise<{ submitted: number; errors: unknown[] }> {
      const monday = currentMonday.value;
      if (!monday) throw new Error("No week loaded");
      if (dayIdx < 0 || dayIdx > 4) throw new Error("Invalid day index");

      const edits = buildEdits(dayIdx);
      const result = await submitWeekHoursApi(monday, edits);
      if (result.errors.length === 0) {
        // Optimistic update for this specific day
        edits.forEach((e) => {
          const row = [...active.value, ...pinned.value].find(
            (r) => r.tpId === e.tpId,
          );
          if (row) {
            if (!row.hours) row.hours = [0, 0, 0, 0, 0, 0, 0];
            row.hours[e.dayIdx] = e.hours;
            if (!row.notes) row.notes = [];
            row.notes[e.dayIdx] = e.description || null;
          }
        });

        for (const key of Object.keys(hoursEdits.value)) {
          if (key.endsWith(`_${dayIdx}`)) {
            delete hoursEdits.value[key];
            delete noteEdits.value[key];
          }
        }
        useAnalysisStore().clearDayHints(dayIdx, currentMonday.value);
        // Give TP a moment to index the new entries before we re-fetch
        await new Promise((r) => setTimeout(r, 500));
        await fetchWeekData(monday, true);
      }
      return result;
    }

    return {
      days,
      active,
      pinned,
      loading,
      error,
      weekData,
      currentMonday,
      hoursEdits,
      noteEdits,
      usExtra,
      pendingPromotion,
      getHours,
      getNote,
      setHours,
      setNote,
      fillDay,
      patchDay,
      clearEdits,
      addExtraTask,
      removeExtraTask,
      schedulePromotion,
      allTasks,
      fetchWeekData,
      buildEdits,
      submitWeekHours,
      submitDayHours,
      totalsRow,
      rendPerDay,
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
