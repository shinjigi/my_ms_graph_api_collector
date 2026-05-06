import { AggregatedDay, BrowserVisit } from "../../shared/aggregator";
import { ProposalEntry } from "../../shared/analysis";
import { SignalDetail } from "./base";
import { dateToString, getTimeStringNoSeconds } from "../../shared/dates";

export interface LeanEvent {
    s: string; // subject
    h: string; // hours "HH:mm-HH:mm"
    att: number | string[]; // attendees count or names
    b?: string; // body snippet
}

export interface LeanChat {
    t: string | null; // topic
    m: [string, string][]; // [from, body]
}

export interface LeanEmail {
    s: string; // subject
    d: "s" | "r"; // direction
    b?: string; // body snippet
}

export interface LeanCommit {
    r: string; // repo
    m: string; // message
}

export interface LeanSvn {
    m: string; // message
    p?: string[]; // paths
}

export interface LeanSeed {
    id: number | null;
    n: string; // name
    h: number; // hours
    c: string; // comment
}

export interface LeanDay {
    dt: string; // date
    t: number;  // target hours
    rep: Record<number, number>; // reported hours
    loc: string; // location
    rem: number; // remaining hours
    cal?: LeanEvent[];
    tms?: LeanChat[];
    eml?: LeanEmail[];
    git?: LeanCommit[];
    svn?: LeanSvn[];
    web?: Record<string, Record<string, { p: string; t: string | null }>>;
    seed?: LeanSeed[];
}

/**
 * Truncates text to a maximum length, adding ellipsis if needed.
 */
function truncate(text: string | undefined | null, max: number): string | undefined {
    if (!text) return undefined;
    if (text.length <= max) return text;
    return text.slice(0, max).trim() + "…";
}

/**
 * Groups browser visits by domain and time.
 */
function reduceWeb(visits: BrowserVisit[]): Record<string, Record<string, { p: string; t: string | null }>> | undefined {
    if (visits.length === 0) return undefined;

    const result: Record<string, Record<string, { p: string; t: string | null }>> = {};

    for (const v of visits) {
        try {
            const url = new URL(v.url);
            const domain = url.hostname.replace(/^www\./, "");
            const path = url.pathname + url.search;
            const time = getTimeStringNoSeconds(v.visitTime);

            if (!result[domain]) result[domain] = {};
            
            // If multiple visits to same domain at same minute, we just keep the latest (or any, really)
            result[domain][time] = {
                p: truncate(path, 100) || "/",
                t: truncate(v.title, 80) || null
            };
        } catch {
            // Ignore invalid URLs
        }
    }

    return Object.keys(result).length > 0 ? result : undefined;
}

export function toLeanDay(
    day: AggregatedDay, 
    detail: SignalDetail, 
    remainingHours: number, 
    preSeeded: ProposalEntry[] = []
): LeanDay {
    const isFull = detail === "full";
    const isCompactOrFull = detail === "compact" || isFull;

    const lean: LeanDay = {
        dt: dateToString(day.date),
        t: day.oreTarget,
        rep: day.reportedHours || {},
        loc: day.location,
        rem: remainingHours
    };

    // Calendar
    if (day.calendar.length > 0) {
        lean.cal = day.calendar.map(e => ({
            s: e.subject,
            h: `${getTimeStringNoSeconds(e.start?.dateTime || undefined)}-${getTimeStringNoSeconds(e.end?.dateTime || undefined)}`,
            att: e.attendees.length > 3 
                ? e.attendees.length 
                : e.attendees.map(a => a.email.split(" ")[0]), // Just the first part of name/email
            b: isFull ? truncate(e.bodyMd, 400) : undefined
        }));
    }

    // Teams
    if (day.teams.length > 0) {
        lean.tms = day.teams.map(c => ({
            t: c.chatTopic,
            m: isFull 
                ? c.messages.slice(0, 5).map(m => [
                    truncate(m.from, 8) || "?", 
                    truncate(m.bodyMd || m.body, 300)!
                  ]) as [string, string][]
                : []
        })).filter(c => isFull || (c.t !== null)); // In compact, only keep named chats? Or just skip if no messages
    }

    // Emails
    if (day.emails.length > 0) {
        const emailLimit = isFull ? 15 : 5;
        lean.eml = day.emails.slice(0, emailLimit).map(e => ({
            s: truncate(e.subject, 80)!,
            d: e.direction === "sent" ? "s" : "r",
            b: isFull ? truncate(e.bodyMd, 400) : undefined
        }));
    }

    // Commits
    if (day.gitCommits.length > 0) {
        lean.git = day.gitCommits.map(c => ({
            r: c.repo,
            m: c.message
        }));
    }

    if (day.svnCommits.length > 0) {
        lean.svn = day.svnCommits.map(c => ({
            m: c.message,
            p: isFull ? c.paths.slice(0, 3) : undefined
        }));
    }

    // Web
    if (isCompactOrFull) {
        lean.web = reduceWeb(day.browserVisits);
    }

    // Pre-seeded
    if (preSeeded.length > 0) {
        lean.seed = preSeeded.map(s => ({
            id: s.taskId,
            n: s.taskName,
            h: s.inferredHours,
            c: s.reasoning // "reasoning" maps to "comment" in AI output, but we use "c" for space
        }));
    }

    return lean;
}
