export interface ProposalEntry {
    taskId:        number | null;
    entityType:    'UserStory' | 'Task' | 'Bug' | 'recurring';
    taskName:      string;
    inferredHours: number;
    confidence:    'high' | 'medium' | 'low';
    reasoning:     string;
    approved:      boolean;
    submitted?:    boolean;
}

export interface DayProposal {
    date:        string;
    oreTarget:   number;
    totalHours:  number;
    entries:     ProposalEntry[];
    generatedAt: string;
}

export interface CalendarEvent {
    id:        string;
    subject:   string;
    start:     { dateTime: string; timeZone: string };
    end:       { dateTime: string; timeZone: string };
    organizer: { emailAddress: { name: string; address: string } } | null;
    attendees: Array<{ emailAddress: { name: string; address: string } }>;
    webLink:   string;
}

export interface TeamsMessage {
    id:              string;
    chatType:        string;
    chatTopic:       string | null;
    createdDateTime: string;
    from:            unknown;
    body:            { contentType: string; content: string };
    messageType:     string;
}

export interface GitCommit {
    hash:    string;
    author:  string;
    date:    string;
    message: string;
    repo:    string;
}

export interface SvnCommit {
    revision: string;
    author:   string;
    date:     string;
    message:  string;
}

export interface AggregatedDay {
    date:       string;
    isWorkday:  boolean;
    oreTarget:  number;
    location:   'office' | 'smart' | 'mixed' | 'unknown';
    calendar:   CalendarEvent[];
    teams:      TeamsMessage[];
    gitCommits: GitCommit[];
    svnCommits: SvnCommit[];
    emails:     unknown[];
}

export interface TpOpenItem {
    id:          number;
    name:        string;
    entityType:  'UserStory' | 'Task' | 'Bug';
    stateName:   string;
    timeSpent:   number;
    projectName: string;
    parentName:  string | null;
}

export interface ProposalWithSignals {
    proposal: DayProposal;
    signals:  AggregatedDay | null;
}

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

export interface TlEvent {
    type:     string;
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
