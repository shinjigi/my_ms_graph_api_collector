import { Attendee, DateTimeTimeZone, Event, ResponseType } from "@microsoft/microsoft-graph-types";
import { turndownService, cleanTeamsGarbage } from "./turndown";
import { createLogger } from "../src/logger";

const log = createLogger("graph");

export interface GraphResponse<T> {
    value: T[];
    "@odata.nextLink"?: string;
}

export interface CalendarEventRaw extends Omit<Event, "organizer" | "attendees" | "body"> {
    id: string;
    subject: string;
    start: DateTimeTimeZone;
    end: DateTimeTimeZone;
    organizer: string;
    attendees: { email: string; response: ResponseType }[];
    isOnlineMeeting: boolean;
    webLink: string;
    body?: string; // HTML originale
    bodyMd?: string; // Markdown (Turndown)
    bodyPreview?: string;
}

export function mapToLeanEvent(e: Event): CalendarEventRaw {
    const htmlContent = e.body?.content ?? "";
    const isHtml = e.body?.contentType === "html";

    const ret =  {
        ...e,
        id: e.id!,
        subject: e.subject ?? "Senza oggetto",
        start: e.start!,
        end: e.end!,

        organizer: `${e.organizer?.emailAddress?.name ?? "unknown"} (${e.organizer?.emailAddress?.address ?? "unknown"})`,

        attendees:
            e.attendees?.map((a: Attendee) => ({
                email: `${a.emailAddress?.name ?? "unknown"} <${a.emailAddress?.address ?? "unknown"}>`,
                response: a.status?.response ?? "none",
            })) ?? [],

        isOnlineMeeting: e.isOnlineMeeting ?? false,
        webLink: e.webLink!,

        // 1. Salviamo l'HTML originale se presente
        body: htmlContent || undefined,

        // 2. Generiamo il Markdown usando Turndown
        // Puliamo prima l'HTML dai rimasugli di Teams
        bodyMd: isHtml ? turndownService.turndown(cleanTeamsGarbage(htmlContent)) : htmlContent,

        bodyPreview: e.bodyPreview ?? undefined,
    };

    log.info(`Cleaned HTML: ${ret.bodyMd}`);
    return ret;
}
