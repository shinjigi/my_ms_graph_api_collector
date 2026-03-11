import * as fs   from 'fs/promises';
import * as path from 'path';
import type { Client } from '@microsoft/microsoft-graph-client';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

interface AttendeeStatus {
    response: string;
}

interface EmailAddress {
    name:    string;
    address: string;
}

export interface CalendarEventRaw {
    id:         string;
    subject:    string;
    start:      { dateTime: string; timeZone: string };
    end:        { dateTime: string; timeZone: string };
    organizer:  { emailAddress: EmailAddress } | null;
    attendees:  Array<{ emailAddress: EmailAddress; status: AttendeeStatus }>;
    isOnlineMeeting: boolean;
    webLink:    string;
}

export async function collectGraphCalendar(client: Client): Promise<string> {
    const since = process.env['COLLECT_SINCE'] ?? '2025-01-01';
    const now   = new Date().toISOString();

    // Use calendarView for date-range filtering (more reliable than /events with $filter)
    const response = await (client as unknown as {
        api: (path: string) => {
            query:   (p: Record<string, string>) => unknown;
            select:  (s: string) => unknown;
            orderby: (s: string) => unknown;
            top:     (n: number) => { get: () => Promise<{ value: CalendarEventRaw[] }> };
        };
    }).api('/me/calendarView')
        .query({ startDateTime: `${since}T00:00:00Z`, endDateTime: now })
        .select('id,subject,start,end,organizer,attendees,isOnlineMeeting,webLink')
        .orderby('start/dateTime')
        .top(2000)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .get() as Promise<{ value: CalendarEventRaw[] }>;

    const events: CalendarEventRaw[] = (await response as unknown as { value: CalendarEventRaw[] }).value ?? [];

    await fs.mkdir(RAW_DIR, { recursive: true });
    const outPath = path.join(RAW_DIR, 'graph-calendar-events.json');
    await fs.writeFile(outPath, JSON.stringify(events, null, 2), 'utf-8');
    return outPath;
}
