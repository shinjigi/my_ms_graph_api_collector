// Shared knowledge-base types — canonical definition used by the TP collector
// (writer) and the analyzer (reader).

export interface KbEntry {
    id:                   number;
    entityType:           string;
    projectName:          string;
    name:                 string;
    summary:              string;
    tags:                 string[];
    userActivities:       Record<string, string>;
    stakeholders:         string[];
    cachedAt:             string;
    createDate?:          string;   // YYYY-MM-DD — item creation date from TP
    currentState?:        string;   // EntityState.Name (e.g. "In Progress")
    isFinalState?:        boolean;  // EntityState.IsFinal from TP
    lastStateChangeDate?: string;   // YYYY-MM-DD of last state transition
    lastActivityDate?:    string;   // YYYY-MM-DD of most recent activity (max of timeEntry + stateChange)
}

export interface KbStore {
    updatedAt?: string;
    items:      KbEntry[];
}
