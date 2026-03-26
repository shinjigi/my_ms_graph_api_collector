import "isomorphic-fetch";
import * as dotenv from "dotenv";
import type {
  TpProject,
  TpEntityRef,
  TpAssignment,
  TpAssignmentEntry,
  TpUserStory,
  TpUserStoryDetail,
  TpTask,
  TpOpenItem,
  TpTimeEntry,
  TpLogTimeInput,
  TpLogTimeResult,
  TpList,
  TpListV2,
  TpUserStat,
} from "./types";
import { parseTpDate, normalizeName } from "./format";

dotenv.config();

function toAssignmentEntries(raw: TpAssignment[]): TpAssignmentEntry[] {
  return raw.map((a) => ({
    fullName: normalizeName(a.GeneralUser.FullName),
    role:     a.Role?.Name ?? "",
  }));
}

export class TargetprocessClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    const url = process.env["TP_BASE_URL"];
    const token = process.env["TP_TOKEN"];

    if (!url || !token) {
      throw new Error("TP_BASE_URL o TP_TOKEN non trovati in .env");
    }

    this.baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;
    this.token = token;
  }

  private buildQs(params: Record<string, string>): string {
    // Build query string preserving special chars used by TP filter syntax
    return Object.entries(params)
      .map(
        ([k, v]) =>
          `${encodeURIComponent(k)}=${encodeURIComponent(v)
            .replaceAll(/%2C/g, ",")
            .replaceAll(/%5B/g, "[")
            .replaceAll(/%5D/g, "]")
            .replaceAll(/%28/g, "(")
            .replaceAll(/%29/g, ")")
            .replaceAll(/%3D/g, "=")
            .replaceAll(/%7B/g, "{")
            .replaceAll(/%7D/g, "}")
            .replaceAll(/%2E/g, ".")}`,
      )
      .join("&");
  }

  private async request<T>(
    version: "v1" | "v2",
    endpoint: string,
    queryParams: Record<string, string> = {},
  ): Promise<T> {
    const params: Record<string, string> = {
      access_token: this.token,
      ...queryParams,
    };

    if (version === "v1") {
      params["format"] = "json";
    }

    const url = `${this.baseUrl}/api/${version}/${endpoint}?${this.buildQs(params)}`;
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `TP API Error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    return (await response.json()) as T;
  }

  async getMe(): Promise<{ Id: number; FullName: string }> {
    return this.request<{ Id: number; FullName: string }>(
      "v1",
      "Users/loggeduser",
      {
        include: "[Id,FullName]",
      },
    );
  }

  async logTime(input: TpLogTimeInput): Promise<TpLogTimeResult> {
    const me = await this.getMe();
    const date = input.date ?? new Date().toISOString().slice(0, 10);

    const payload = {
      Assignable: { Id: input.usId },
      User: { Id: me.Id },
      Spent: input.spent,
      Remain: 0,
      Date: date,
      Description: input.description,
    };

    const qs = `format=json&access_token=${this.token}`;
    const url = `${this.baseUrl}/api/v1/Times?${qs}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `TP API Error: ${response.status} ${response.statusText} - ${errorText}`,
      );
    }

    const raw = (await response.json()) as {
      Id: number;
      Date: string;
      Spent: number;
      Description: string;
      User: { FullName: string };
      Assignable: { Name: string };
    };

    return {
      id: raw.Id,
      date: parseTpDate(raw.Date),
      spent: raw.Spent,
      description: raw.Description,
      user: raw.User.FullName,
      assignable: raw.Assignable.Name,
    };
  }

  async getProjectsAssignedToMe(): Promise<TpProject[]> {
    const me = await this.getMe();

    const result = await this.request<TpListV2<TpProject>>("v2", "projects", {
      where: `(projectMembers.any(user.id==${me.Id}))`,
      select: "{id,name,description,isActive}",
      take: "200",
    });

    return result.items;
  }

  async getUserStoriesByProject(
    projectId: number,
    options: { fromDate?: string } = {},
  ): Promise<TpUserStory[]> {
    const allItems: TpUserStory[] = [];
    let skip = 0;
    const take = 200;

    let where = `(Project.Id eq ${projectId})`;
    if (options.fromDate) {
      where += `and(CreateDate gte '${options.fromDate}')`;
    }

    while (true) {
      const result = await this.request<TpList<TpUserStory>>(
        "v1",
        "UserStories",
        {
          where,
          include:
            "[Id,Name,Description,CreateDate,EndDate,EntityState[Name],Priority[Name],Owner[FullName],Effort,Iteration[Name],Assignments[GeneralUser[FullName]]]",
          orderby: "CreateDate",
          take: String(take),
          skip: String(skip),
        },
      );

      allItems.push(...result.Items);

      if (!result.Next || result.Items.length < take) break;
      skip += take;
    }

    return allItems;
  }

  async getUserStory(usId: number): Promise<TpUserStoryDetail> {
    return await this.request<TpUserStoryDetail>("v1", `UserStories/${usId}`, {
      include:
        "[Id,Name,Description,EntityState[Name],Owner[FullName],TimeSpent]",
    });
  }

  async getTimesByAssignable(assignableId: number): Promise<TpTimeEntry[]> {
    const allItems: TpTimeEntry[] = [];
    let skip = 0;
    const take = 200;

    while (true) {
      const result = await this.request<TpList<TpTimeEntry>>("v1", "Times", {
        where: `(Assignable.Id eq ${assignableId})`,
        include: "[Id,Date,Spent,Description,User[FullName]]",
        orderby: "Date",
        take: String(take),
        skip: String(skip),
      });

      allItems.push(...result.Items);

      if (!result.Next || result.Items.length < take) break;
      skip += take;
    }

    return allItems;
  }

  /**
   * Returns all UserStories and Tasks assigned to the current user that are not in a final state.
   * Includes TimeSpent so callers can compute the daily balance.
   */
  async getMyAssignedOpenItems(): Promise<TpOpenItem[]> {
    const me = await this.getMe();
    const items: TpOpenItem[] = [];

    type EntityStateWithFinal = TpEntityRef & { IsFinal: boolean };
    type WithExtra = {
      TimeSpent: number;
      Project: { Id: number; Name: string } | null;
      EntityState: EntityStateWithFinal | null;
      LastStateChangeDate?: string;
      CreateDate?: string;
    };

    // NOTE: TP v1 does not support boolean filters (EntityState.IsFinal eq false raises a 400).
    // We fetch all assigned items and filter client-side by EntityState.IsFinal.

    // Fetch UserStories assigned to me
    const usResult = await this.request<TpList<TpUserStory & WithExtra>>(
      "v1",
      "UserStories",
      {
        where:   `(Assignments.GeneralUser.Id eq ${me.Id})`,
        include: "[Id,Name,Description,EntityState[Name,IsFinal],TimeSpent,Project[Id,Name],Owner[FullName],Assignments[GeneralUser[FullName],Role[Name]],CreateDate,LastStateChangeDate]",
        take:    "200",
      },
    );

    for (const us of usResult.Items) {
      if (us.EntityState?.IsFinal) continue;
      items.push({
        id:                   us.Id,
        name:                 us.Name,
        description:          us.Description,
        entityType:           "UserStory",
        stateName:            us.EntityState?.Name ?? "",
        isFinalState:         us.EntityState?.IsFinal ?? false,
        timeSpent:            us.TimeSpent ?? 0,
        projectName:          us.Project?.Name ?? "",
        parentName:           null,
        owner:                normalizeName(us.Owner?.FullName ?? "N/A"),
        assignments:          toAssignmentEntries(us.Assignments?.Items ?? []),
        createDate:           us.CreateDate ? parseTpDate(us.CreateDate) : undefined,
        lastStateChangeDate:  us.LastStateChangeDate ? parseTpDate(us.LastStateChangeDate) : undefined,
      });
    }

    // Fetch Tasks assigned to me
    const taskResult = await this.request<TpList<TpTask & WithExtra>>(
      "v1",
      "Tasks",
      {
        where:   `(Assignments.GeneralUser.Id eq ${me.Id})`,
        include: "[Id,Name,Description,EntityState[Name,IsFinal],TimeSpent,Project[Id,Name],UserStory[Id,Name,Owner[FullName]],Owner[FullName],Assignments[GeneralUser[FullName],Role[Name]],CreateDate,LastStateChangeDate]",
        take:    "200",
      },
    );

    for (const task of taskResult.Items) {
      if (task.EntityState?.IsFinal) continue;
      items.push({
        id:                   task.Id,
        name:                 task.Name,
        description:          task.Description,
        entityType:           "Task",
        stateName:            task.EntityState?.Name ?? "",
        isFinalState:         task.EntityState?.IsFinal ?? false,
        timeSpent:            task.TimeSpent ?? 0,
        projectName:          task.Project?.Name ?? "",
        parentName:           task.UserStory?.Name ?? null,
        owner:                normalizeName(task.Owner?.FullName ?? "N/A"),
        assignments:          toAssignmentEntries(task.Assignments?.Items ?? []),
        createDate:           task.CreateDate ? parseTpDate(task.CreateDate) : undefined,
        lastStateChangeDate:  task.LastStateChangeDate ? parseTpDate(task.LastStateChangeDate) : undefined,
      });
    }

    return items;
  }

  /**
   * Returns time entries logged by a user on a specific date.
   *
   * NOTE: TargetProcess stores dates in /Date(ms+tz)/ format internally. The
   * plain YYYY-MM-DD filter syntax in the `where` clause may or may not work
   * depending on the TP version. If this returns unexpected results, switch to
   * a ms-range filter: Date gte '/Date(startMs)/' and Date lte '/Date(endMs)/'.
   */
  async getTimesByUserAndDate(
    userId: number,
    date: string,
  ): Promise<TpTimeEntry[]> {
    const result = await this.request<TpList<TpTimeEntry>>("v1", "Times", {
      where: `(User.Id eq ${userId}) and (Date gte '${date}') and (Date lte '${date}')`,
      include: "[Id,Date,Spent,Description,User[FullName],Assignable[Id,Name]]",
      take: "200",
    });
    return result.Items;
  }

  /**
   * Returns all time entries logged by a user within a date range (inclusive).
   */
  async getTimesByUserAndDateRange(
    userId: number,
    from: string,
    to: string,
  ): Promise<TpTimeEntry[]> {
    const allItems: TpTimeEntry[] = [];
    let skip = 0;
    const take = 200;

    while (true) {
      const result = await this.request<TpList<TpTimeEntry>>("v1", "Times", {
        where: `(User.Id eq ${userId}) and (Date gte '${from}') and (Date lte '${to}')`,
        include:
          "[Id,Date,Spent,Description,User[FullName],Assignable[Id,Name,EntityState[Name],Project[Id,Name]]]",
        orderby: "Date",
        take: String(take),
        skip: String(skip),
      });

      allItems.push(...result.Items);

      if (!result.Next || result.Items.length < take) break;
      skip += take;
    }

    return allItems;
  }

  /**
   * Searches assignable items by keyword across UserStories and Tasks.
   */
  async searchAssignables(keyword: string, take = 20): Promise<TpOpenItem[]> {
    const items: TpOpenItem[] = [];

    type TpUsSearch = TpUserStory & {
      TimeSpent: number;
      Project: { Id: number; Name: string } | null;
    };
    const usResult = await this.request<TpList<TpUsSearch>>(
      "v1",
      "UserStories",
      {
        where: `(Name contains '${keyword}')`,
        include:
          "[Id,Name,Description,EntityState[Name,IsFinal],TimeSpent,Project[Id,Name],Owner[FullName],Assignments[GeneralUser[FullName]]]",
        take: String(take),
      },
    );

    for (const us of usResult.Items) {
      items.push({
        id:           us.Id,
        name:         us.Name,
        description:  us.Description,
        entityType:   "UserStory",
        stateName:    (us.EntityState as (TpEntityRef & { IsFinal?: boolean }) | null)?.Name ?? "",
        isFinalState: (us.EntityState as (TpEntityRef & { IsFinal?: boolean }) | null)?.IsFinal ?? false,
        timeSpent:    us.TimeSpent ?? 0,
        projectName:  us.Project?.Name ?? "",
        parentName:   null,
        owner:        normalizeName(us.Owner?.FullName ?? "N/A"),
        assignments:  toAssignmentEntries(us.Assignments?.Items ?? []),
      });
    }

    return items;
  }

  /**
   * Aggrega le ore caricate su un item specifico raggruppandole per utente.
   */
  async getAssignableStatistics(assignableId: number): Promise<TpUserStat[]> {
    const entries = await this.getTimesByAssignable(assignableId);
    const statsMap = new Map<
      string,
      { totalHours: number; entries: number; descriptions: string[] }
    >();

    for (const entry of entries) {
      const userName = entry.User?.FullName || "Unknown";
      const current = statsMap.get(userName) || {
        totalHours: 0,
        entries: 0,
        descriptions: [],
      };

      statsMap.set(userName, {
        totalHours: current.totalHours + entry.Spent,
        entries: current.entries + 1,
        descriptions: [...current.descriptions, entry.Description].filter(
          (v): v is string => !!v,
        ),
      });
    }

    return Array.from(statsMap.entries()).map(([userName, data]) => ({
      userName,
      totalHours: Math.round(data.totalHours * 100) / 100,
      entries: data.entries,
      descriptions: data.descriptions,
    }));
  }
}
