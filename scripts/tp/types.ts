export interface TpProject {
    id:          number;
    name:        string;
    description: string | null;
    isActive:    boolean;
}

export interface TpEntityRef {
    Name: string;
}

export interface TpUserRef {
    FullName: string;
}

export interface TpAssignment {
    GeneralUser: TpUserRef;
}

export interface TpUserStory {
    Id:          number;
    Name:        string;
    Description: string | null;
    CreateDate:  string;
    EndDate:     string | null;
    EntityState: TpEntityRef | null;
    Priority:    TpEntityRef | null;
    Owner:       TpUserRef   | null;
    Effort:      number;
    Iteration:   TpEntityRef | null;
    Assignments: { Items: TpAssignment[] };
}

export interface TpUserStoryDetail {
    Id:          number;
    Name:        string;
    EntityState: TpEntityRef | null;
    Owner:       TpUserRef   | null;
    TimeSpent:   number;
}

export interface TpTimeEntry {
    Id:          number;
    Date:        string;
    Spent:       number;
    Description: string | null;
    User:        TpUserRef | null;
}

export interface TpLogTimeInput {
    usId:        number;
    description: string;
    spent:       number;      // hours
    date?:       string;      // YYYY-MM-DD, defaults to today
}

export interface TpLogTimeResult {
    id:          number;
    date:        string;
    spent:       number;
    description: string;
    user:        string;
    assignable:  string;
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
