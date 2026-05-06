import {
    Attendee,
    ChatMessage,
    DateTimeTimeZone,
    Event,
    Message,
    Recipient,
    ResponseType,
} from "@microsoft/microsoft-graph-types";
import { turndownService, cleanTeamsGarbage } from "./turndown";
import { createLogger } from "../src/logger";
import { parseDateString } from "./dates";

const log = createLogger("graph-shared");

export interface GraphPage<T> {
    value: T[];
    "@odata.nextLink"?: string;
}


/** Single Teams message — only fields actually consumed downstream. */
export interface TeamsChatMessageRaw {
    id: string;
    createdDateTime: Date;         // ISO 8601 (string: JSON serialization boundary)
    from: string | null;             // displayName only — flattened
    body: string;                    // plain text OR cleaned HTML
    bodyMd?: string | null;          // Markdown (Turndown)
    webUrl: string | null;
    messageType: string;             // "message" | "systemEventMessage" | etc.
}

/** A chat with its messages. Single source of truth — also the per-chat raw file shape. */
export interface TeamsChatDataRaw {
    chatId: string;
    chatTopic: string | null;
    chatType: string;                // "oneOnOne" | "group" | "meeting"
    lastModifiedDateTime: Date;      // ISO 8601 — Graph API sync cursor
    messages: TeamsChatMessageRaw[];
}


// --- Calendar ---

export interface CalendarEventRaw extends Omit<Event, "organizer" | "attendees" | "body"> {
    id: string;
    subject: string;
    start: DateTimeTimeZone;
    end: DateTimeTimeZone;
    organizer: string;
    attendees: {
        email: string;
        response: ResponseType;
    }[];
    isOnlineMeeting: boolean;
    webLink: string;
    body?: string; // HTML originale
    bodyMd?: string; // Markdown (Turndown)
    bodyPreview?: string;
}


// --- Email ---

export interface EmailRaw extends Omit<
    Message,
    "from" | "toRecipients" | "ccRecipients" | "bccRecipients" | "body"
> {
    id: string;
    subject: string;
    from: string;
    toRecipients: string[];
    direction: "received" | "sent";
    sentDateTime?: string | null;
    bodyPreview?: string | null;
    webLink: string;
    body?: string; // HTML originale
    bodyMd?: string | null; // Markdown (Turndown)
}


export function mapToLeanEvent(e: Event): CalendarEventRaw {
    const bodyContent = e.body?.content ?? "";
    const isHtml = e.body?.contentType === "html";

    // Pulizia e conversione (una sola volta)
    const cleanedHtml = isHtml ? cleanTeamsGarbage(bodyContent) : bodyContent;
    const bodyMd = isHtml ? turndownService.turndown(cleanedHtml) : bodyContent;

    const ret = {
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

        // 1. Salviamo l'HTML pulito se presente
        body: cleanedHtml || undefined,

        // 2. Usiamo il Markdown già generato
        bodyMd,

        bodyPreview: e.bodyPreview ?? undefined,
    };

    log.debug(`Event BodyMD length: ${ret.bodyMd?.length ?? 0}`);
    return ret;
}


export function mapToLeanEmail(m: Message, direction: "received" | "sent"): EmailRaw {
    const bodyContent = m.body?.content ?? "";
    const isHtml = m.body?.contentType === "html";

    // Pulizia e conversione (una sola volta)
    const cleanedHtml = isHtml ? cleanTeamsGarbage(bodyContent) : bodyContent;
    const bodyMd = isHtml ? turndownService.turndown(cleanedHtml) : bodyContent;

    const ret = {
        ...m,
        id: m.id!,
        subject: m.subject ?? "Senza oggetto",
        from: `${m.from?.emailAddress?.name ?? "unknown"} <${m.from?.emailAddress?.address ?? "unknown"}>`,
        toRecipients:
            m.toRecipients
                ?.map((r: Recipient) => ({
                    email: `${r.emailAddress?.name ?? "unknown"} <${r.emailAddress?.address ?? "unknown"}>`,
                }))
                .map((x) => x.email) ?? [],

        direction,
        webLink: m.webLink!,

        // 1. Salviamo l'HTML originale se presente
        body: cleanedHtml || undefined,

        // 2. Usiamo il Markdown già generato
        bodyMd,

        bodyPreview: m.bodyPreview ?? undefined,
    };

    log.debug(`Email BodyMD length: ${ret.bodyMd?.length ?? 0}`);
    return ret;
}


// ─── Message mapping ────────────────────────────────────────────────────────

export function mapToLeanMessage(m: ChatMessage): TeamsChatMessageRaw {
    const bodyContent = m.body?.content ?? "";
    const isHtml = m.body?.contentType === "html";

    // Pulizia (tramite DOM se HTML, altrimenti stringa)
    const cleaned = isHtml ? cleanTeamsGarbage(bodyContent) : bodyContent;
    
    // Conversione in Markdown via Turndown (gestisce correttamente sia HTML che testo)
    const bodyMd = turndownService.turndown(cleaned);

    return {
        id: m.id!,
        createdDateTime: parseDateString(m.createdDateTime ?? "1970-01-01T00:00:00Z"), // fallback per sicurezza
        from: (m.from as { user?: { displayName?: string } })?.user?.displayName ?? null,
        body: cleaned, // Originale pulito (HTML se presente)
        bodyMd,        // Markdown strutturato per l'IA
        webUrl: (m as { webUrl?: string }).webUrl ?? null,
        messageType: m.messageType ?? "message",
    };
}
