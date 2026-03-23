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

// --- Raw signal types (mirroring backend collector interfaces) ---

export interface CalendarEventRaw {
    id:      string;
    subject: string;
    start:   { dateTime: string; timeZone: string };
    end:     { dateTime: string; timeZone: string };
    organizer?: { emailAddress: { name: string; address: string } } | null;
    isOnlineMeeting?: boolean;
}

export interface GitCommitRaw {
    hash:    string;
    author:  string;
    date:    string;    // YYYY-MM-DD (no time)
    message: string;
    repo?:   string;
}

export interface SvnCommitRaw {
    revision: string;
    author:   string;
    date:     string;   // YYYY-MM-DD
    message:  string;
    paths?:   string[];
}

export interface EmailRaw {
    id:               string;
    subject:          string;
    from:             { emailAddress: { name: string; address: string } } | null;
    receivedDateTime: string;
    bodyPreview:      string;
    webLink:          string;
}

// --- API Response Types (from backend) ---

export interface WeekDayResponse {
    date:        string;
    isWorkday:   boolean;
    oreTarget:   number;
    location:    string;
    nibol:       string | null;
    holiday:     boolean;
    holidayName?: string;
    zucchetti:   unknown;
    calendar:    CalendarEventRaw[];
    emails:      EmailRaw[];
    teams:       unknown[];
    svnCommits:  SvnCommitRaw[];
    gitCommits:  GitCommitRaw[];
    browserVisits: unknown[];
}

export interface ApiWeekResponse {
    monday: string;
    days:   WeekDayResponse[];
}

export interface ApiTpWeekEntry {
    tpId:        number;
    usName:      string;
    stateName:   string;
    timeSpent:   number;
    projectName: string;
    hours:       number[];
}

export interface ApiTpWeekResponse {
    userId:   number;
    userName: string;
    entries:  ApiTpWeekEntry[];
    openItems: unknown[];
}

// --- Submit types ---

export interface SubmitEdit {
    tpId:        number;
    dayIdx:      number;
    hours:       number;
    date:        string;
    description: string;
}

export interface SubmitResult {
    submitted: number;
    errors:    Array<{ tpId: number; date: string; error: string }>;
}

export interface ZucchettiRequestResult {
    success:      boolean;
    message:      string;
    skipped?:     boolean;
    scrapeError?: string;
    dayUpdate?:   WeekDayResponse;
}

// --- Analysis types ---

export interface ProposalEntry {
    taskId:        number | null;
    entityType:    'UserStory' | 'Task' | 'Bug' | 'recurring';
    taskName:      string;
    inferredHours: number;
    confidence:    'high' | 'medium' | 'low';
    reasoning:     string;
    approved:      boolean;
}

export interface DayProposal {
    date:        string;
    oreTarget:   number;
    totalHours:  number;
    entries:     ProposalEntry[];
    generatedAt: string;
    provider?:   string;
}

export interface AnalysisJobStatus {
    status:    'pending' | 'running' | 'done' | 'error';
    dates:     string[];
    completed: Record<string, DayProposal>;
    errors:    Record<string, string>;
    startedAt: string;
}

export interface AnalyzeStartResponse {
    jobId: string;
    dates?: string[];
}
