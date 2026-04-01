export interface TpProject {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface TpEntityRef {
  Name: string;
}

export interface TpUserRef {
  FullName: string;
}

export interface TpAssignment {
  GeneralUser: TpUserRef;
  Role: { Id: number; Name: string } | null;
}

export interface TpAssignmentEntry {
  fullName: string; // normalized display name
  role: string; // e.g. "Developer (Realisator)", "" if null
}

export interface TpUserStory {
  Id: number;
  Name: string;
  Description: string | null;
  CreateDate: string;
  EndDate: string | null;
  EntityState: TpEntityRef | null;
  Priority: TpEntityRef | null;
  Owner: TpUserRef | null;
  Effort: number;
  Iteration: TpEntityRef | null;
  Assignments: { Items: TpAssignment[] };
}

export interface TpUserStoryDetail {
  Id: number;
  Name: string;
  EntityState: TpEntityRef | null;
  Owner: TpUserRef | null;
  TimeSpent: number;
  Description: string | null;
}

export interface TpTask {
  Id: number;
  Name: string;
  Description: string | null;
  EntityState: TpEntityRef | null;
  Owner: TpUserRef | null;
  UserStory: { Id: number; Name: string } | null;
  Project: { Id: number; Name: string } | null;
  TimeSpent: number;
  Assignments: { Items: TpAssignment[] };
}

export interface TpOpenItem {
  id: number;
  name: string;
  description: string | null;
  entityType: "UserStory" | "Task" | "Bug";
  stateName: string;
  isFinalState: boolean;
  timeSpent: number;
  projectName: string;
  parentName: string | null;
  owner: string; // normalized
  assignments: TpAssignmentEntry[];
  createDate?: string; // YYYY-MM-DD
  lastStateChangeDate?: string; // YYYY-MM-DD
}

export interface TpTimeEntry {
  Id: number;
  Date: string;
  Spent: number;
  Description: string | null;
  User: TpUserRef | null;
  Assignable?: {
    Id: number;
    Name: string;
    EntityState?: { Name: string } | null;
    Project?: { Id: number; Name: string } | null;
  };
}

export interface TpUserStat {
  userName: string;
  totalHours: number;
  entries: number;
  descriptions: string[];
}

export interface TpLogTimeInput {
  usId: number;
  entityType?: "UserStory" | "Task" | "Bug";
  description: string;
  spent: number; // hours
  date?: string; // YYYY-MM-DD, defaults to today
}

export interface TpLogTimeResult {
  id: number;
  date: string;
  spent: number;
  description: string;
  user: string;
  assignable: string;
}

// Generic paginated v1 response
export interface TpList<T> {
  Items: T[];
  Next?: string;
}

// Generic paginated v2 response
export interface TpListV2<T> {
  items: T[];
  next?: string;
}

export interface TpWeekEntry {
  tpId: number;
  usName: string;
  stateName: string;
  timeSpent: number;
  projectName: string;
  hours: number[];
  notes: Array<string | null>;
}

export interface TpWeekResponse {
  userId: number;
  userName: string;
  entries: TpWeekEntry[];
  openItems: unknown[];
}
