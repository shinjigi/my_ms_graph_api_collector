import { CalendarEventRaw } from "./graph";
import { ZucchettiDay, WorkLocation } from "./zucchetti";

export interface NibolBooking {
    date: Date;
    type: string; // e.g. "office", "home", "external"
    details?: string;
}

export interface BrowserVisit {
  visitId: string; // "<source>-<id>" to avoid collisions across profiles
  source: string; // e.g. "chrome-profile1", "firefox"
  url: string;
  title: string | null;
  visitTime: string; // ISO 8601
  date: Date;
}


interface EmailAddress {
  name: string;
  address: string;
}


export interface EmailRaw {
  id: string;
  subject: string;
  from: { emailAddress: EmailAddress } | null;
  toRecipients: [{ emailAddress: EmailAddress }] | null;
  direction: "received" | "sent";
  receivedDateTime?: string;
  sentDateTime?: string;
  bodyPreview: string;
  webLink: string;
}

/** Single Teams message — only fields actually consumed downstream. */
export interface TeamsChatMessage {
    id: string;
    createdDateTime: string;         // ISO 8601 (string: JSON serialization boundary)
    from: string | null;             // displayName only — flattened
    body: string;                    // plain text, HTML stripped at collection time
    webUrl: string | null;
    messageType: string;             // "message" | "systemEventMessage" | etc.
}

/** A chat with its messages. Single source of truth — also the per-chat raw file shape. */
export interface TeamsChatData {
    chatId: string;
    chatTopic: string | null;
    chatType: string;                // "oneOnOne" | "group" | "meeting"
    lastModifiedDateTime: string;    // ISO 8601 — Graph API sync cursor
    messages: TeamsChatMessage[];
}

export interface GitCommitRaw {
  hash: string;
  author: string;
  email: string;
  date: string; // YYYY-MM-DD
  message: string;
  repo: string;
}

export interface SvnCommitRaw {
  revision: string;
  author: string;
  date: string; // YYYY-MM-DD
  message: string;
  paths: string[];
}

export interface AggregatedDay {
  date: Date;
  isWorkday: boolean;
  isComplete: boolean; // True if the day has ended and all data is final
  oreTarget: number; // decimal hours from Zucchetti hOrd
  location: WorkLocation;
  nibol: NibolBooking | null;
  zucchetti: ZucchettiDay | null;
  calendar: CalendarEventRaw[];
  emails: EmailRaw[];
  teams: TeamsChatData[];
  svnCommits: SvnCommitRaw[];
  gitCommits: GitCommitRaw[];
  browserVisits: BrowserVisit[];
  reportedHours?: Record<number, number>; // taskId -> hours already in TargetProcess
}
