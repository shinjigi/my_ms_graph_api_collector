import { defineStore }           from 'pinia';
import { ref, computed, watch }  from 'vue';
import { US_TODAY_DEFAULT, TL_EVENTS, EMAILS, WORKDAY_HOURS } from '../mock/data';
import { usePickerStore }        from './usePickerStore';
import { useTimesheetStore }     from './useTimesheetStore';
import { stateColor }            from '../utils';
import type { UsCard, QuickLogItem, TlEvent, Email, TlEventType } from '../types';

export const useDayStore = defineStore('day', () => {
    const usExtra  = ref<UsCard[]>([]);
    const usToday  = ref<UsCard[]>(US_TODAY_DEFAULT.map(u => ({ ...u })));
    const tlEvents = ref<TlEvent[]>(TL_EVENTS);
    const emails   = ref<Email[]>(EMAILS);
    const usNotes  = ref<Record<number, string>>({});

    function loadDay(date: string) {
        const ts     = useTimesheetStore();
        const picker = usePickerStore();

        const dayData = ts.weekData?.days.find(d => d.date === date);
        if (!dayData) return;

        // Map calendar events to TlEvents
        const calEvents: TlEvent[] = dayData.calendar.map(ev => {
            const start        = new Date(ev.start.dateTime);
            const end          = new Date(ev.end.dateTime);
            const durationMins = Math.max(
                Math.round((end.getTime() - start.getTime()) / 60_000),
                18
            );
            return {
                type:  'meeting' as TlEventType,
                time:  `${String(start.getHours()).padStart(2,'0')}:${String(start.getMinutes()).padStart(2,'0')}`,
                label: ev.subject,
                top:   0,
                h:     durationMins,
            };
        });

        // Map git commits to TlEvents (date-only from collector — place at 10:00 as marker)
        const gitEvents: TlEvent[] = dayData.gitCommits.map(c => ({
            type:  'commit' as TlEventType,
            time:  '10:00',
            label: `[${c.repo ?? 'git'}] ${c.message.split('\n')[0].slice(0, 80)}`,
            top:   0,
            h:     18,
        }));

        // Map SVN commits to TlEvents
        const svnEvents: TlEvent[] = dayData.svnCommits.map(c => ({
            type:  'svn' as TlEventType,
            time:  '11:00',
            label: c.message.split('\n')[0].slice(0, 80),
            top:   0,
            h:     18,
        }));

        // Map emails to TlEvents + Email view models
        const emailList: Email[]  = [];
        const emailEvents: TlEvent[] = [];

        dayData.emails.forEach((e, idx) => {
            const dt = new Date(e.receivedDateTime);
            const hh = String(dt.getHours()).padStart(2, '0');
            const mm = String(dt.getMinutes()).padStart(2, '0');
            emailList.push({
                dir:     'in',
                from:    e.from?.emailAddress?.address ?? '',
                to:      'me',
                subject: e.subject,
                time:    `${hh}:${mm}`,
                body:    e.bodyPreview,
            });
            emailEvents.push({
                type:    'email-in' as TlEventType,
                time:    `${hh}:${mm}`,
                label:   e.subject,
                top:     0,
                h:       18,
                emailId: idx,
            });
        });

        // Combine and sort all events by time
        const allEvents = [...calEvents, ...gitEvents, ...svnEvents, ...emailEvents]
            .sort((a, b) => a.time.localeCompare(b.time));

        tlEvents.value = allEvents.length > 0 ? allEvents : TL_EVENTS;
        emails.value   = emailList.length > 0  ? emailList  : EMAILS;

        // Rebuild usToday from active TP tasks that have hours on this day
        const dayIdx = picker.selectedDayIdx;
        if (dayIdx >= 0 && ts.active.length > 0) {
            const activeTasks = ts.active
                .filter(r => ts.getHours(r.tpId, dayIdx) > 0)
                .map(r => ({
                    us:       r.us,
                    tpId:     r.tpId,
                    state:    r.state,
                    tpHours:  ts.getHours(r.tpId, dayIdx),
                    zucHours: WORKDAY_HOURS,
                    emails:   0,
                    commits:  0,
                    meetings: 0,
                    color:    stateColor(r.state),
                    note:     ts.getNote(r.tpId, dayIdx),
                }));

            // Preserve user-added items not managed by TP
            const tsIds  = new Set([...ts.active, ...ts.pinned].map(r => r.tpId));
            const extras = usExtra.value.filter(u => !tsIds.has(u.tpId));

            if (activeTasks.length > 0) {
                usToday.value = [...activeTasks, ...extras];
            }
        }
    }

    // Auto-reload day view when week data or selected date changes
    watch(
        [() => useTimesheetStore().weekData, () => usePickerStore().pickerSelected],
        () => {
            const picker = usePickerStore();
            const d      = picker.pickerSelected;
            const yr     = d.getFullYear();
            const mo     = String(d.getMonth() + 1).padStart(2, '0');
            const day    = String(d.getDate()).padStart(2, '0');
            loadDay(`${yr}-${mo}-${day}`);
        }
    );

    const quickLog = computed<QuickLogItem[]>(() => {
        const ts = useTimesheetStore();
        const inToday = new Set(usToday.value.map(u => u.tpId));
        return [...ts.active, ...ts.pinned]
            .filter(r => !inToday.has(r.tpId))
            .map(r => ({
                us: r.us, tpId: r.tpId, state: r.state,
                tpHours: 0, zucHours: WORKDAY_HOURS,
                emails: 0, commits: r.git?.[4] ?? 0, meetings: 0,
                color: stateColor(r.state), note: '',
                totAllTime: r.totAllTime,
                rem: r.rem,
            }));
    });

    function addToWorkToday(tpId: number) {
        if (usToday.value.some(u => u.tpId === tpId)) return;
        const ts  = useTimesheetStore();
        const src = [...ts.active, ...ts.pinned].find(r => r.tpId === tpId);
        if (!src) return;
        const item: UsCard = {
            us: src.us, tpId: src.tpId, state: src.state,
            tpHours: 0, zucHours: WORKDAY_HOURS,
            emails: 0, commits: 0, meetings: 0,
            color: stateColor(src.state), note: '',
        };
        usToday.value.push(item);
        usExtra.value.push(item);
    }

    function setUsNote(tpId: number, text: string) {
        usNotes.value[tpId] = text;
    }

    function setTpHours(tpId: number, val: number) {
        const u = usToday.value.find(x => x.tpId === tpId);
        if (u) u.tpHours = Math.max(0, +val.toFixed(1));
        // Bridge to timesheet store so dashboard edits are reflected in the week totals and submit flow.
        const ts     = useTimesheetStore();
        const picker = usePickerStore();
        const dayIdx = picker.selectedDayIdx;
        if (dayIdx >= 0) ts.setHours(tpId, dayIdx, val);
    }

    const dayTotals = computed(() => {
        const picker = usePickerStore();
        const ts     = useTimesheetStore();
        const dayIdx = picker.selectedDayIdx;
        const tp     = dayIdx < 0
            ? 0
            : +[...ts.active, ...ts.pinned].reduce((acc, r) => acc + ts.getHours(r.tpId, dayIdx), 0).toFixed(1);
        const zuc    = dayIdx < 0 ? 0 : (ts.days[dayIdx]?.zucHours ?? 0);
        return { tp, zuc, delta: +(zuc - tp).toFixed(1) };
    });

    return {
        usExtra, usToday, tlEvents, emails, usNotes,
        quickLog, dayTotals,
        loadDay, addToWorkToday, setUsNote, setTpHours,
    };
}, {
    persist: [
        { key: 'portal_us_notes',  pick: ['usNotes']  },
        { key: 'portal_us_extra',  pick: ['usExtra']  },
    ],
});
