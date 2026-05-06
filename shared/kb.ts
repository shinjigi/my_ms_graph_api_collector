// Shared knowledge-base types — canonical definition used by the TP collector
// (writer) and the analyser (reader).

export interface KbEntry {
    id:                   number;
    entityType:           string;
    projectName:          string;
    name:                 string;
    summary:              string;
    tags:                 string[];
    userActivities:       Record<string, string>;
    stakeholders:         string[];
    cachedAt:             Date;
    createDate?:          Date | null;   // item creation date from TP
    currentState?:        string;   // EntityState.Name (e.g. "In Progress")
    isFinalState?:        boolean;  // EntityState.IsFinal from TP
    lastStateChangeDate?: Date | null;   // last state transition
    lastActivityDate?:    Date | null;   // most recent activity (max of timeEntry + stateChange)
}

export interface KbStore {
    updatedAt?: string | Date;
    items:      KbEntry[];
}
