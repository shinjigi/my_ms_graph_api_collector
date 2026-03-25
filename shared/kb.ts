// Shared knowledge-base types — canonical definition used by the TP collector
// (writer) and the analyzer (reader).

export interface KbEntry {
    id:             number;
    entityType:     string;
    projectName:    string;
    name:           string;
    summary:        string;
    tags:           string[];
    userActivities: Record<string, string>;
    stakeholders:   string[];
    cachedAt:       string;
}

export interface KbStore {
    updatedAt?: string;
    items:      KbEntry[];
}
