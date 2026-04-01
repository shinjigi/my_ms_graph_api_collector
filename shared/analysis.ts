// Shared analysis types — used by the analyzer backend and the Vue frontend.

export interface ProposalEntry {
    taskId:        number | null;
    entityType:    'UserStory' | 'Task' | 'Bug' | 'recurring';
    taskName:      string;
    inferredHours: number;
    confidence:    'high' | 'medium' | 'low';
    reasoning:     string;
    comment?:      string;
    approved:      boolean;
    status?:       'suggested' | 'applied' | 'dismissed' | 'modified';
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
  status: "pending" | "running" | "done" | "error";
  dates: string[];
  completed: Record<string, DayProposal>;
  errors: Record<string, string>;
  startedAt: string;
}

export interface AnalyzeStartResponse {
  jobId: string;
  dates?: string[];
}
