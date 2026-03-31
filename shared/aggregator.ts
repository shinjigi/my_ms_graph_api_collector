import { ZucchettiDay } from "./zucchetti";

export interface NibolBooking {
  date:     string;  // YYYY-MM-DD
  type:     string;  // e.g. "office", "home", "external"
  details?: string;
}

export interface BrowserVisit {
  visitId: string; // "<source>-<id>" to avoid collisions across profiles
  source: string; // e.g. "chrome-profile1", "firefox"
  url: string;
  title: string | null;
  visitTime: string; // ISO 8601
  date: string; // YYYY-MM-DD
}

interface AttendeeStatus {
  response: string;
}

interface EmailAddress {
  name: string;
  address: string;
}

export interface CalendarEventRaw {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer: { emailAddress: EmailAddress } | null;
  attendees: Array<{ emailAddress: EmailAddress; status: AttendeeStatus }>;
  isOnlineMeeting: boolean;
  webLink: string;
}

export interface EmailRaw {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } } | null;
  receivedDateTime: string;
  bodyPreview: string;
  webLink: string;
}

export interface TeamsMessageRaw {
  id: string;
  chatId: string;
  chatType: string;
  chatTopic: string | null;
  createdDateTime: string;
  lastModifiedDateTime: string;
  from: unknown;
  body: { contentType: string; content: string };
  webUrl: string | null;
  messageType: string;
}

export interface ChatState {
  lastModifiedDateTime: string; // ISO — fetch only messages newer than this
  topic: string | null;
  chatType: string;
}

export interface GitCommit {
  hash: string;
  author: string;
  email: string;
  date: string; // YYYY-MM-DD
  message: string;
  repo: string;
}

export interface SvnCommit {
  revision: string;
  author: string;
  date: string; // YYYY-MM-DD
  message: string;
  paths: string[];
}

export interface AggregatedDay {
  date: string; // YYYY-MM-DD
  isWorkday: boolean;
  oreTarget: number; // decimal hours from Zucchetti hOrd
  location: "office" | "smart" | "travel" | "external" | "mixed" | "unknown";
  nibol: NibolBooking | null;
  zucchetti: ZucchettiDay | null;
  calendar: CalendarEventRaw[];
  emails: EmailRaw[];
  teams: TeamsMessageRaw[];
  svnCommits: SvnCommit[];
  gitCommits: GitCommit[];
  browserVisits: BrowserVisit[];
}
