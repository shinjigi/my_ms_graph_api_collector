// --- Activity Portal types ---

export interface Holiday {
    m:    number;
    d:    number;
    name: string;
}

export interface Day {
    label:       string;
    date:        string;
    rend:        'ok' | 'warn' | 'err' | null;
    zucHours:    number;
    nibol:       string | null;
    holiday:     boolean;
    holidayName?: string;
}

export type TsRowState = 'Inception' | 'Dev/Unit test' | 'Testing';

export interface TsRow {
    project:    string;
    us:         string;
    tpId:       number;
    state:      string;
    totAllTime: number;
    hours?:     number[];
    git?:       number[];
    svn?:       number[];
    notes?:     (string | null)[];
    rem?:       number;
}

export interface UsCard {
    us:         string;
    tpId:       number;
    state:      string;
    tpHours:    number;
    zucHours:   number;
    zucPercent?: number;
    emails:     number;
    commits:    number;
    meetings:   number;
    color:      string;
    note:       string;
}

export type TlEventType = 'meeting' | 'commit' | 'svn' | 'email-in' | 'email-out';

export interface TlEvent {
    type:     TlEventType;
    time:     string;
    label:    string;
    top:      number;
    h:        number;
    emailId?: number;
    corrUs?:  string;
}

export interface Email {
    dir:     'in' | 'out';
    from:    string;
    to:      string;
    subject: string;
    time:    string;
    body:    string;
}

export type ActiveView = 'dashboard' | 'timesheet' | 'activity' | 'teams' | 'browser';

export interface QuickSortState {
    field: 'state' | 'ore' | 'chiusura';
    dir:   1 | -1;
}

export interface BrowserDomain {
    domain:  string;
    visits:  number;
    pct:     number;
}

/** UsCard enriched with timesheet-level fields for the quick-log list. */
export interface QuickLogItem extends UsCard {
    totAllTime: number;
    rem?:       number;
}
