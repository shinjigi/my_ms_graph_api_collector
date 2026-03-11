import 'isomorphic-fetch';
import * as dotenv from 'dotenv';
import type {
    TpProject,
    TpUserStory,
    TpUserStoryDetail,
    TpTimeEntry,
    TpLogTimeInput,
    TpLogTimeResult,
    TpList,
    TpListV2,
} from './types';

dotenv.config();

export class TargetprocessClient {
    private readonly baseUrl: string;
    private readonly token:   string;

    constructor() {
        const url   = process.env['TP_BASE_URL'];
        const token = process.env['TP_TOKEN'];

        if (!url || !token) {
            throw new Error('TP_BASE_URL o TP_TOKEN non trovati in .env');
        }

        this.baseUrl = url.endsWith('/') ? url.slice(0, -1) : url;
        this.token   = token;
    }

    private buildQs(params: Record<string, string>): string {
        // Build query string preserving special chars used by TP filter syntax
        return Object.entries(params)
            .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)
                .replace(/%2C/g, ',').replace(/%5B/g, '[').replace(/%5D/g, ']')
                .replace(/%28/g, '(').replace(/%29/g, ')').replace(/%3D/g, '=')
                .replace(/%7B/g, '{').replace(/%7D/g, '}').replace(/%2E/g, '.')}`)
            .join('&');
    }

    private async request<T>(version: 'v1' | 'v2', endpoint: string, queryParams: Record<string, string> = {}): Promise<T> {
        const params: Record<string, string> = { access_token: this.token, ...queryParams };

        if (version === 'v1') {
            params['format'] = 'json';
        }

        const url      = `${this.baseUrl}/api/${version}/${endpoint}?${this.buildQs(params)}`;
        const response = await fetch(url, { headers: { 'Accept': 'application/json' } });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`TP API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        return await response.json() as T;
    }

    async logTime(input: TpLogTimeInput): Promise<TpLogTimeResult> {
        const me   = await this.request<{ Id: number }>('v1', 'Users/loggeduser', { include: '[Id]' });
        const date = input.date ?? new Date().toISOString().slice(0, 10);

        const payload = {
            Assignable:  { Id: input.usId },
            User:        { Id: me.Id },
            Spent:       input.spent,
            Remain:      0,
            Date:        date,
            Description: input.description,
        };

        const qs  = `format=json&access_token=${this.token}`;
        const url = `${this.baseUrl}/api/v1/Times?${qs}`;

        const response = await fetch(url, {
            method:  'POST',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
            body:    JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`TP API Error: ${response.status} ${response.statusText} - ${errorText}`);
        }

        const raw = await response.json() as {
            Id: number; Date: string; Spent: number; Description: string;
            User: { FullName: string }; Assignable: { Name: string };
        };

        return {
            id:         raw.Id,
            date:       new Date(parseInt(raw.Date.replace(/\/Date\((\d+)[+-]\d+\)\//, '$1'), 10)).toISOString().slice(0, 10),
            spent:      raw.Spent,
            description: raw.Description,
            user:       raw.User.FullName,
            assignable: raw.Assignable.Name,
        };
    }

    async getProjectsAssignedToMe(): Promise<TpProject[]> {
        const me = await this.request<{ Id: number }>('v1', 'Users/loggeduser', { include: '[Id]' });

        const result = await this.request<TpListV2<TpProject>>('v2', 'projects', {
            where:  `(projectMembers.any(user.id==${me.Id}))`,
            select: '{id,name,description,isActive}',
            take:   '200',
        });

        return result.items;
    }

    async getUserStoriesByProject(projectId: number, options: { fromDate?: string } = {}): Promise<TpUserStory[]> {
        const allItems: TpUserStory[] = [];
        let skip = 0;
        const take = 200;

        let where = `(Project.Id eq ${projectId})`;
        if (options.fromDate) {
            where += `and(CreateDate gte '${options.fromDate}')`;
        }

        while (true) {
            const result = await this.request<TpList<TpUserStory>>('v1', 'UserStories', {
                where,
                include: '[Id,Name,Description,CreateDate,EndDate,EntityState[Name],Priority[Name],Owner[FullName],Effort,Iteration[Name],Assignments[GeneralUser[FullName]]]',
                orderby: 'CreateDate',
                take:    String(take),
                skip:    String(skip),
            });

            allItems.push(...result.Items);

            if (!result.Next || result.Items.length < take) break;
            skip += take;
        }

        return allItems;
    }

    async getUserStory(usId: number): Promise<TpUserStoryDetail> {
        return await this.request<TpUserStoryDetail>('v1', `UserStories/${usId}`, {
            include: '[Id,Name,EntityState[Name],Owner[FullName],TimeSpent]',
        });
    }

    async getTimesByAssignable(assignableId: number): Promise<TpTimeEntry[]> {
        const allItems: TpTimeEntry[] = [];
        let skip = 0;
        const take = 200;

        while (true) {
            const result = await this.request<TpList<TpTimeEntry>>('v1', 'Times', {
                where:   `(Assignable.Id eq ${assignableId})`,
                include: '[Id,Date,Spent,Description,User[FullName]]',
                orderby: 'Date',
                take:    String(take),
                skip:    String(skip),
            });

            allItems.push(...result.Items);

            if (!result.Next || result.Items.length < take) break;
            skip += take;
        }

        return allItems;
    }
}
