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
