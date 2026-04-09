import { defineStore } from "pinia";
import { computed } from "vue";
import { usePickerStore } from "./usePickerStore";
import { useTimesheetStore } from "./useTimesheetStore";
import { stateColor } from "../utils";
import type { UsCard, QuickLogItem, TlEvent, Email } from "../types";
import { WORKDAY_HOURS } from "@shared/standards";
import { getTimeStringNoSeconds } from "@shared/dates";

export const useDayStore = defineStore("day", () => {
    const ts = useTimesheetStore();
    const picker = usePickerStore();

    // The single source of indices
    const dayIdx = computed(() => picker.selectedDayIdx);

    // The specific day data from the week response
    const dayData = computed(() => {
        if (dayIdx.value < 0 || !ts.weekData) return null;
        return ts.weekData.days[dayIdx.value] || null;
    });

    // --- Computed Signals for Dashboard ---

    const teams = computed(() => dayData.value?.teams || []);
    const browser = computed(() => dayData.value?.browserVisits || []);
    const gitCommits = computed(() => dayData.value?.gitCommits || []);
    const svnCommits = computed(() => dayData.value?.svnCommits || []);

    const emails = computed<Email[]>(() => {
        if (!dayData.value) return [];
        return dayData.value.emails.map((e) => {
            const isSent = e.direction === "sent";
            const dt = isSent ? e.sentDateTime : e.receivedDateTime;
            return {
                dir: isSent ? "out" : "in",
                from: isSent ? "me" : (e.from?.emailAddress?.address ?? ""),
                to: isSent ? (e.toRecipients?.[0]?.emailAddress?.address ?? "") : "me",
                subject: e.subject,
                time: dt ? getTimeStringNoSeconds(dt) : "--:--",
                body: e.bodyPreview,
            };
        });
    });

    const tlEvents = computed<TlEvent[]>(() => {
        const d = dayData.value;
        if (!d) return [];

        const events: TlEvent[] = [];

        // Meetings
        d.calendar.forEach((ev) => {
            const start = new Date(ev.start.dateTime ?? "");
            const end = new Date(ev.end.dateTime ?? "");
            const durationMins = Math.max(
                Math.round((end.getTime() - start.getTime()) / 60_000),
                18,
            );
            events.push({
                type: "meeting",
                time: getTimeStringNoSeconds(start),
                label: ev.subject,
                top: 0,
                h: durationMins,
            });
        });

        // Git markers (placed at 10:00)
        d.gitCommits.forEach((c) => {
            events.push({
                type: "commit",
                time: "10:00",
                label: `[${c.repo ?? "git"}] ${c.message.split("\n")[0].slice(0, 80)}`,
                top: 0,
                h: 18,
            });
        });

        // SVN markers (placed at 11:00)
        d.svnCommits.forEach((c) => {
            events.push({
                type: "svn",
                time: "11:00",
                label: c.message.split("\n")[0].slice(0, 80),
                top: 0,
                h: 18,
            });
        });

        // Email markers
        d.emails.forEach((e, idx) => {
            const isSent = e.direction === "sent";
            const rawDt = isSent ? e.sentDateTime : e.receivedDateTime;
            const hm = rawDt ? getTimeStringNoSeconds(rawDt) : "00:00";
            events.push({
                type: isSent ? "email-out" : "email-in",
                time: hm,
                label: e.subject,
                top: 0,
                h: 18,
                emailId: idx,
            });
        });

        return events.sort((a, b) => a.time.localeCompare(b.time));
    });

    // --- Active Work Panel (usToday) ---

    /**
     * Combines active TP tasks (where hours > 0 on this day) and manual usExtra items.
     */
    const usToday = computed<UsCard[]>(() => {
        if (dayIdx.value < 0) return [];

        // 1. Gather all possible rows (Active, Pinned, Extra)
        const allPossible = [...ts.active, ...ts.pinned, ...ts.usExtra];

        // 2. Filter only those that have hours already set for TODAY
        const activeToday = allPossible.filter((r) => ts.getHours(r.tpId, dayIdx.value) > 0);

        // 3. Map to UsCard for the view
        return activeToday.map((r) => ({
            us: r.us,
            tpId: r.tpId,
            state: r.state,
            tpHours: ts.getHours(r.tpId, dayIdx.value),
            zucHours: WORKDAY_HOURS, // Target per day
            emails: 0, // Placeholder if needed
            commits: (r.git?.[dayIdx.value] ?? 0) + (r.svn?.[dayIdx.value] ?? 0),
            meetings: dayData.value?.calendar.length ?? 0,
            color: stateColor(r.state),
            note: ts.getNote(r.tpId, dayIdx.value),
        }));
    });

    const quickLog = computed<QuickLogItem[]>(() => {
        if (dayIdx.value < 0) return [];
        const inToday = new Set(usToday.value.map((u) => u.tpId));

        return [...ts.active, ...ts.pinned]
            .filter((r) => !inToday.has(r.tpId))
            .map((r) => ({
                us: r.us,
                tpId: r.tpId,
                state: r.state,
                tpHours: 0,
                zucHours: WORKDAY_HOURS,
                emails: 0,
                commits: (r.git?.[dayIdx.value] ?? 0) + (r.svn?.[dayIdx.value] ?? 0),
                meetings: 0,
                color: stateColor(r.state),
                note: "",
                totAllTime: r.totAllTime,
                rem: r.rem,
            }));
    });

    // --- Actions ---

    function addToWorkToday(tpId: number) {
        if (dayIdx.value < 0) return;
        ts.setHours(tpId, dayIdx.value, 0.1); // Setting minimum hours "activates" it for today view
    }

    function addManualRow(name: string) {
        if (dayIdx.value < 0) return;
        ts.addExtraTask(name, dayIdx.value);
    }

    function setUsNote(tpId: number, text: string) {
        if (dayIdx.value < 0) return;
        ts.setNote(tpId, dayIdx.value, text);
    }

    function setTpHours(tpId: number, val: number) {
        if (dayIdx.value < 0) return;
        ts.setHours(tpId, dayIdx.value, val);
    }

    const dayTotals = computed(() => {
        if (dayIdx.value < 0) return { tp: 0, zuc: 0, delta: 0 };
        const tp = +[...ts.active, ...ts.pinned, ...ts.usExtra]
            .reduce((acc, r) => acc + ts.getHours(r.tpId, dayIdx.value), 0)
            .toFixed(1);
        const zuc = ts.days[dayIdx.value]?.zucHours ?? 0;
        return { tp, zuc, delta: +(zuc - tp).toFixed(1) };
    });

    return {
        usToday,
        tlEvents,
        emails,
        teams,
        browser,
        gitCommits,
        svnCommits,
        quickLog,
        dayTotals,
        addToWorkToday,
        addManualRow,
        setUsNote,
        setTpHours,
    };
});
