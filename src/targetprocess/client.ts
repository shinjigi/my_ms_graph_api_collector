import "isomorphic-fetch";
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
} from "@shared/targetprocess";
import { parseTpDate, normalizeName } from "./format";
import { dateToString } from "../../shared/dates";
import { createLogger } from "../logger";
import { CONFIG } from "@shared/env-config";

const log = createLogger("tp-client");

function toAssignmentEntries(raw: TpAssignment[]): TpAssignmentEntry[] {
  return raw.map((a) => ({
    fullName: normalizeName(a.GeneralUser.FullName),
    role: a.Role?.Name ?? "",
  }));
}

export class TargetprocessClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor() {
    const url = CONFIG.TP_BASE_URL;
    const token = CONFIG.TP_TOKEN;

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
            .replaceAll("%2C", ",")
            .replaceAll("%5B", "[")
            .replaceAll("%5D", "]")
            .replaceAll("%28", "(")
            .replaceAll("%29", ")")
            .replaceAll("%3D", "=")
            .replaceAll("%7B", "{")
            .replaceAll("%7D", "}")
            .replaceAll("%2E", ".")}`,
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
    const date = dateToString(input.date);

    // 1. Check for existing time entries for this user, date and usId
    const existing = await this.getTimesByUserAndDate(me.Id, date);
    const matches = existing.filter((e) => e.Assignable?.Id === input.usId);
    
    if (input.spent <= 0) {
      if (matches.length > 0) {
        log.info(`Deleting time entries for US#${input.usId} on ${date} (spent 0)`);
        for (const match of matches) {
          await this.deleteTime(match.Id);
        }
      }
      return {
        id: 0,
        date: parseTpDate(date),
        spent: 0,
        description: "",
        user: me.FullName,
        assignable: "",
      };
    }

    const payload = {
      Assignable: { Id: input.usId },
      User: { Id: me.Id },
      Spent: input.spent,
      Remain: 0,
      Date: date,
      Description: input.description,
    };

    const qs = `format=json&access_token=${this.token}`;

    if (matches.length > 0) {
      // 2. We have at least one entry: UPDATE the first one
      const targetId = matches[0].Id;
      log.info(
        `Updating existing time entry ${targetId} for US#${input.usId} on ${date}`,
      );

      const url = `${this.baseUrl}/api/v1/Times/${targetId}?${qs}`;
      const response = await fetch(url, {
        method: "POST", // TP v1 POST to existing ID = Update
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        log.error(`Update Error: ${response.status} - ${errorText}`);
        throw new Error(
          `TP API Update Error: ${response.status} - ${errorText}`,
        );
      }

      // 3. Cleanup: if there were multiple entries (e.g. manual duplicates), DELETE the others
      if (matches.length > 1) {
        const others = matches.slice(1);
        log.info(
          `Cleaning up ${others.length} extra duplicates for US#${input.usId} on ${date}`,
        );
        for (const extra of others) {
          await this.deleteTime(extra.Id);
        }
      }

      const raw = await response.json();
      return {
        id: raw.Id,
        date: parseTpDate(raw.Date),
        spent: raw.Spent,
        description: raw.Description,
        user: raw.User.FullName,
        assignable: raw.Assignable.Name,
      };
    } else {
      // 4. No entry exists: CREATE new (original logic)
      log.info(`Creating new time entry for US#${input.usId} on ${date}`);
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
        log.error(`Create Error: ${response.status} - ${errorText}`);
        throw new Error(
          `TP API Create Error: ${response.status} - ${errorText}`,
        );
      }

      const raw = await response.json();
      return {
        id: raw.Id,
        date: parseTpDate(raw.Date),
        spent: raw.Spent,
        description: raw.Description,
        user: raw.User.FullName,
        assignable: raw.Assignable.Name,
      };
    }
  }

  async deleteTime(id: number): Promise<void> {
    const qs = `access_token=${this.token}`;
    const url = `${this.baseUrl}/api/v1/Times/${id}?${qs}`;
    const response = await fetch(url, {
      method: "DELETE",
      headers: { Accept: "application/json" },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`TP API Delete Error: ${response.status} - ${errorText}`);
    }
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
    let where = `(Project.Id eq ${projectId})`;
    if (options.fromDate) {
      where += `and(CreateDate gte '${options.fromDate}')`;
    }
    return this.fetchAllPages<TpUserStory>(
      "UserStories",
      where,
      "[Id,Name,Description,CreateDate,EndDate,EntityState[Name],Priority[Name],Owner[FullName],Effort,Iteration[Name],Assignments[GeneralUser[FullName]]]",
      "CreateDate",
    );
  }

  async getUserStory(usId: number): Promise<TpUserStoryDetail> {
    return await this.request<TpUserStoryDetail>("v1", `UserStories/${usId}`, {
      include:
        "[Id,Name,Description,EntityState[Name],Owner[FullName],TimeSpent]",
    });
  }

  async getTimesByAssignable(assignableId: number): Promise<TpTimeEntry[]> {
    return this.fetchAllPages<TpTimeEntry>(
      "Times",
      `(Assignable.Id eq ${assignableId})`,
      "[Id,Date,Spent,Description,User[FullName]]",
      "Date",
    );
  }

  /** Paginated fetch from TP v1 — returns all items across all pages. */
  private async fetchAllPages<T>(
    entity: string,
    where: string,
    include: string,
    orderby?: string,
  ): Promise<T[]> {
    const all: T[] = [];
    const take = 200;
    let skip = 0;
    while (true) {
      const params: Record<string, string> = { where, include, take: String(take), skip: String(skip) };
      if (orderby) params.orderby = orderby;
      const result = await this.request<TpList<T>>("v1", entity, params);
      all.push(...result.Items);
      if (!result.Next || result.Items.length < take) break;
      skip += take;
    }
    return all;
  }

  /**
   * Resolves full names to TP user IDs.
   */
  async resolveUserIdsByName(names: string[]): Promise<number[]> {
    if (names.length === 0) return [];
    const ids: number[] = [];
    await Promise.all(
      names.map(async (name) => {
        const result = await this.request<TpList<{ Id: number }>>("v1", "Users", {
          where: `(FullName eq '${name}')`,
          include: "[Id]",
          take: "5",
        });
        for (const u of result.Items) ids.push(u.Id);
      }),
    );
    return ids;
  }

  /**
   * Returns open UserStories and Tasks matching any of:
   *   - assigned to the logged-in user
   *   - associated with a TP team (Team.Name filter)
   *   - created by a specific owner (Owner.Id filter)
   *
   * Runs one paginated query per filter in parallel, merges and deduplicates.
   * Items from excludedProjects are removed entirely.
   *
   * NOTE: TP v1 does not support boolean filters (EntityState.IsFinal eq false → 400).
   * Filters non-final state client-side.
   */
  async getMyAssignedOpenItems(opts?: {
    teamNames?: string[];
    creatorIds?: number[];
    excludedProjects?: string[];
    itemsSinceDays?: number;
  }): Promise<TpOpenItem[]> {
    const me = await this.getMe();

    type EntityStateWithFinal = TpEntityRef & { IsFinal: boolean };
    type WithExtra = {
      TimeSpent: number;
      Project: { Id: number; Name: string } | null;
      EntityState: EntityStateWithFinal | null;
      LastStateChangeDate?: string;
      CreateDate?: string;
    };

    const US_INCLUDE =
      "[Id,Name,Description,EntityState[Name,IsFinal],TimeSpent,Project[Id,Name],Owner[FullName],Assignments[GeneralUser[FullName],Role[Name]],CreateDate,LastStateChangeDate]";
    const TASK_INCLUDE =
      "[Id,Name,Description,EntityState[Name,IsFinal],TimeSpent,Project[Id,Name],UserStory[Id,Name,Owner[FullName]],Owner[FullName],Assignments[GeneralUser[FullName],Role[Name]],CreateDate,LastStateChangeDate]";

    // Build one where clause per source; TP v1 does not support OR across
    // Assignments.* and Team.* in the same clause.
    // Apply LastStateChangeDate filter to all queries: UserStories can have
    // thousands of historical entries (5000+) — limiting to recent items keeps
    // response time under ~1 second across all parallel queries.
    const sinceDays = opts?.itemsSinceDays ?? 365;
    const sinceDate = new Date(Date.now() - sinceDays * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const since = ` and (LastStateChangeDate gte '${sinceDate}')`;

    const baseClauses = [
      `(Assignments.GeneralUser.Id eq ${me.Id})`,
      ...(opts?.teamNames ?? []).map((n) => `(Team.Name eq '${n}')`),
      ...(opts?.creatorIds ?? []).map((id) => `(Owner.Id eq ${id})`),
    ];
    // UserStories have thousands of historical entries — apply since filter to keep
    // response time manageable. Tasks are fewer (~1000) and stay unfiltered.
    const usWhereClauses = baseClauses.map((w) => `${w}${since}`);
    const taskWhereClauses = baseClauses;

    const excludedPatterns = (opts?.excludedProjects ?? []).map((p) => p.toLowerCase());

    const allRawUS: Array<TpUserStory & WithExtra> = [];
    const allRawTasks: Array<TpTask & WithExtra> = [];

    await Promise.all([
      ...usWhereClauses.map((where) =>
        this.fetchAllPages<TpUserStory & WithExtra>("UserStories", where, US_INCLUDE).then(
          (r) => allRawUS.push(...r),
        ),
      ),
      ...taskWhereClauses.map((where) =>
        this.fetchAllPages<TpTask & WithExtra>("Tasks", where, TASK_INCLUDE).then(
          (r) => allRawTasks.push(...r),
        ),
      ),
    ]);

    const items: TpOpenItem[] = [];
    const seenIds = new Set<number>();

    const addUS = (us: TpUserStory & WithExtra) => {
      if (us.EntityState?.IsFinal) return;
      if (excludedPatterns.some((p) => (us.Project?.Name ?? "").toLowerCase().includes(p))) return;
      if (seenIds.has(us.Id)) return;
      seenIds.add(us.Id);
      items.push({
        id: us.Id,
        name: us.Name,
        description: us.Description,
        entityType: "UserStory",
        stateName: us.EntityState?.Name ?? "",
        isFinalState: us.EntityState?.IsFinal ?? false,
        timeSpent: us.TimeSpent ?? 0,
        projectName: us.Project?.Name ?? "",
        parentName: null,
        owner: normalizeName(us.Owner?.FullName ?? "N/A"),
        assignments: toAssignmentEntries(us.Assignments?.Items ?? []),
        createDate: us.CreateDate ? parseTpDate(us.CreateDate) : undefined,
        lastStateChangeDate: us.LastStateChangeDate
          ? parseTpDate(us.LastStateChangeDate)
          : undefined,
      });
    };

    const addTask = (task: TpTask & WithExtra) => {
      if (task.EntityState?.IsFinal) return;
      if (excludedPatterns.some((p) => (task.Project?.Name ?? "").toLowerCase().includes(p))) return;
      if (seenIds.has(task.Id)) return;
      seenIds.add(task.Id);
      items.push({
        id: task.Id,
        name: task.Name,
        description: task.Description,
        entityType: "Task",
        stateName: task.EntityState?.Name ?? "",
        isFinalState: task.EntityState?.IsFinal ?? false,
        timeSpent: task.TimeSpent ?? 0,
        projectName: task.Project?.Name ?? "",
        parentName: task.UserStory?.Name ?? null,
        owner: normalizeName(task.Owner?.FullName ?? "N/A"),
        assignments: toAssignmentEntries(task.Assignments?.Items ?? []),
        createDate: task.CreateDate ? parseTpDate(task.CreateDate) : undefined,
        lastStateChangeDate: task.LastStateChangeDate
          ? parseTpDate(task.LastStateChangeDate)
          : undefined,
      });
    };

    for (const us of allRawUS) addUS(us);
    for (const task of allRawTasks) addTask(task);

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
  private async getTimesByUserAndDate(
    userId: number,
    date: Date | string,
  ): Promise<TpTimeEntry[]> {
    const dStr = dateToString(date);
    const result = await this.request<TpList<TpTimeEntry>>("v1", "Times", {
      where: `(User.Id eq ${userId}) and (Date gte '${dStr}') and (Date lte '${dStr}')`,
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
    from: Date | string,
    to: Date | string,
  ): Promise<TpTimeEntry[]> {
    const fromStr = dateToString(from);
    const toStr = dateToString(to);
    const allItems: TpTimeEntry[] = [];
    let skip = 0;
    const take = 200;

    while (true) {
      const result = await this.request<TpList<TpTimeEntry>>("v1", "Times", {
        where: `(User.Id eq ${userId}) and (Date gte '${fromStr}') and (Date lte '${toStr}')`,
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
      EntityState: (TpEntityRef & { IsFinal?: boolean }) | null;
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
        id: us.Id,
        name: us.Name,
        description: us.Description,
        entityType: "UserStory",
        stateName: us.EntityState?.Name ?? "",
        isFinalState: us.EntityState?.IsFinal ?? false,
        timeSpent: us.TimeSpent ?? 0,
        projectName: us.Project?.Name ?? "",
        parentName: null,
        owner: normalizeName(us.Owner?.FullName ?? "N/A"),
        assignments: toAssignmentEntries(us.Assignments?.Items ?? []),
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
