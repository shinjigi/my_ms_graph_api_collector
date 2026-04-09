import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { Client } from "@microsoft/microsoft-graph-client";
import { Chat, ChatMessage } from "@microsoft/microsoft-graph-types";
import { createLogger } from "../../logger";
import { readJson, writeJson, readMeta, writeMeta } from "../../json-io";
import { TeamsChatData, TeamsChatMessage } from "@shared/aggregator";
import { dateToString, extractMonthStr, getApiStartOfDay } from "@shared/dates";

const log = createLogger("graph-teams");

const TEAMS_DIR = path.join(process.cwd(), "data", "raw", "graph-teams");

// ─── Filename helpers ───────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
    return name
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")        // Remove accents
        .replace(/[^a-zA-Z0-9\s-_]/g, "")       // Remove symbols like #, @, (, ), etc.
        .trim()
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_");                    // Collapse double underscores
}

function getChatPrefix(chatType: string): string {
    if (chatType === "oneOnOne") return "O2O";
    if (chatType === "group")    return "GRP";
    if (chatType === "meeting")  return "MET";
    return chatType.substring(0, 3).toUpperCase();
}

/**
 * Builds the stable filename stem for a single chat.
 * Pattern: <PREFIX>__<sanitized topic>__<last 6 chars of chat id>
 */
function buildChatFileName(
    chatId: string,
    chatType: string,
    topic: string,
): string {
    const safeName  = sanitizeFilename(topic);
    const prefix    = getChatPrefix(chatType);
    const uniquePart = chatId.split("@")[0] || chatId;
    const hash      = uniquePart.substring(uniquePart.length - 6);
    return `${prefix}__${safeName}__${hash}`;
}

// ─── HTML stripping ─────────────────────────────────────────────────────────

function stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

// ─── Graph API types ────────────────────────────────────────────────────────

interface GraphPage<T> {
    value: T[];
    "@odata.nextLink"?: string;
}

// ─── Message mapping ────────────────────────────────────────────────────────

function mapToLeanMessage(m: ChatMessage): TeamsChatMessage {
    return {
        id:                  m.id!,
        createdDateTime:     m.createdDateTime!,
        from:                (m.from as { user?: { displayName?: string } })?.user?.displayName ?? null,
        body:                stripHtml(m.body?.content ?? ""),
        webUrl:              (m as { webUrl?: string }).webUrl ?? null,
        messageType:         m.messageType ?? "message",
    };
}

// ─── Graph fetch ────────────────────────────────────────────────────────────

/**
 * Fetch new/modified messages for a single chat using
 * $filter=lastModifiedDateTime gt <since>.
 * Returns messages sorted newest-first and the max lastModifiedDateTime seen.
 */
async function fetchChatMessagesSince(
    c: Client,
    chatId: string,
    since: string,
): Promise<{ messages: ChatMessage[]; maxLastModified: string }> {
    const messages: ChatMessage[] = [];
    let maxLastModified = since;
    let nextLink: string | null = null;

    do {
        const res = (
            nextLink
                ? await c.api(nextLink).get()
                : await c
                    .api(`/me/chats/${chatId}/messages`)
                    .orderby("lastModifiedDateTime desc")
                    .filter(`lastModifiedDateTime gt ${since}`)
                    .top(50)
                    .get()
        ) as GraphPage<ChatMessage>;

        const page: ChatMessage[] = res.value ?? [];
        nextLink = res["@odata.nextLink"] ?? null;

        for (const m of page) {
            if (m.lastModifiedDateTime && m.lastModifiedDateTime > maxLastModified) {
                maxLastModified = m.lastModifiedDateTime;
            }
        }

        messages.push(...page);
    } while (nextLink);

    return { messages, maxLastModified };
}

// ─── Main collector ─────────────────────────────────────────────────────────

export async function collectGraphTeams(
    client: Client,
    date?: string,
    force = false,
): Promise<string[]> {
    const today = dateToString();

    await mkdir(TEAMS_DIR, { recursive: true });

    // TEAMS_CHAT_LIMIT: max chats to enumerate (Graph returns newest-first).
    // Set to 0 for unlimited. Default 200.
    const chatLimit = Number(process.env["TEAMS_CHAT_LIMIT"] ?? 200);

    // ── Enumerate all chats ──────────────────────────────────────────────────
    const allChats: Chat[] = [];
    let chatsNextLink: string | null = null;

    do {
        const res = (
            chatsNextLink
                ? await client.api(chatsNextLink).get()
                : await client
                    .api("/me/chats")
                    .select("id,topic,chatType,lastUpdatedDateTime")
                    .top(50)
                    .get()
        ) as GraphPage<Chat>;

        allChats.push(...(res.value ?? []));
        chatsNextLink =
            chatLimit === 0 || allChats.length < chatLimit
                ? (res["@odata.nextLink"] ?? null)
                : null;
    } while (chatsNextLink);

    // Apply hard cap after pagination
    if (chatLimit > 0 && allChats.length > chatLimit) allChats.splice(chatLimit);

    log.info(
        `  [Teams] ${allChats.length} chat trovate${chatLimit > 0 ? ` (limite: ${chatLimit})` : ""}`,
    );

    // ── Resolve current user display name ────────────────────────────────────
    let myName = "";
    try {
        const me = await client.api("/me").select("displayName").get();
        myName = me.displayName;
    } catch {
        // Silently ignore — only used to skip self in 1-on-1 topic resolution
    }

    // In single-day mode, restrict writes to the relevant month only
    const targetMonth = date ? extractMonthStr(date) : null;

    const collectSince =
        process.env["TEAMS_COLLECT_SINCE"] ??
        process.env["COLLECT_SINCE"] ??
        "2025-01-01";

    const outPathsSet = new Set<string>();
    const meta        = await readMeta(TEAMS_DIR);
    let chatIdx       = 0;

    // ── Process each chat ────────────────────────────────────────────────────
    for (const chat of allChats) {
        const chatId = chat.id ?? "0";

        if (chatId === "0") {
            console.warn("Chat ID is 0, skipping", chat);
            continue;
        }

        chatIdx++;

        // Derive the filename for this chat's per-chat data file.
        // We need a preliminary topic to construct the filename; the real topic
        // may be refined below after fetching messages.
        const prelimTopic = chat.topic ?? `(no topic) ${chatId.slice(25, 35)}`;
        const fileName    = buildChatFileName(chatId, chat.chatType ?? "unknown", prelimTopic);
        const outPath     = path.join(TEAMS_DIR, `${fileName}.json`);

        // Read the existing per-chat file (contains sync cursor + previous messages).
        const existing = await readJson<TeamsChatData>(outPath, {
            chatId,
            chatTopic:             null,
            chatType:              chat.chatType ?? "unknown",
            lastModifiedDateTime:  collectSince,
            messages:              [],
        });

        // Determine the incremental since threshold.
        let since = force ? collectSince : existing.lastModifiedDateTime;
        if (since.length <= 10) {
            since = getApiStartOfDay(since);
        }

        try {
            const { messages: rawMessages, maxLastModified } =
                await fetchChatMessagesSince(client, chatId, since);

            if (rawMessages.length === 0) {
                if (chatIdx % 50 === 0) {
                    log.info(`    [Progress] Analizzate ${chatIdx}/${allChats.length} chat...`);
                }
                continue;
            }

            // Resolve the display topic (use peer name for 1-on-1 chats with no topic).
            let resolvedTopic = chat.topic;
            if (!resolvedTopic) {
                for (const m of rawMessages) {
                    const u = (m.from as { user?: { displayName?: string } })?.user?.displayName;
                    if (u && u !== myName) {
                        resolvedTopic = u;
                        break;
                    }
                }
            }
            if (!resolvedTopic) resolvedTopic = "Unknown";

            log.info(
                `    [Chat ${chatIdx}/${allChats.length}] ${resolvedTopic}: +${rawMessages.length} messaggi`,
            );

            // Map to lean messages, filtering by month in single-day mode.
            const newLean: TeamsChatMessage[] = [];
            for (const m of rawMessages) {
                if (!m.createdDateTime) continue;
                const month = extractMonthStr(m.createdDateTime);
                if (targetMonth && month !== targetMonth) continue;
                newLean.push(mapToLeanMessage(m));
            }

            if (newLean.length === 0) continue;

            // Merge with existing in-memory messages (dedup by id).
            const msgMap = new Map<string, TeamsChatMessage>();
            for (const m of existing.messages) msgMap.set(m.id, m);
            for (const m of newLean)            msgMap.set(m.id, m);
            const merged = Array.from(msgMap.values());

            // Build the updated TeamsChatData and write back.
            const updated: TeamsChatData = {
                chatId,
                chatTopic:            resolvedTopic,
                chatType:             chat.chatType ?? "unknown",
                lastModifiedDateTime: maxLastModified,
                messages:             merged,
            };

            await writeJson(outPath, updated);

            // Update the .meta.json sidecar.
            const activeDays = new Set<string>();
            for (const m of merged) {
                const cd = m.createdDateTime?.substring(0, 10);
                if (cd) activeDays.add(cd);
            }
            await writeMeta(TEAMS_DIR, fileName, {
                lastExtractedDate: today,
                sources:           ["graph"],
                activeDays:        Array.from(activeDays),
            });

            outPathsSet.add(outPath);

            if (chatIdx % 50 === 0) {
                log.info(`    [Progress] Analizzate ${chatIdx}/${allChats.length} chat...`);
            }
        } catch (err: unknown) {
            // Inaccessible chats (403/404): skip silently
            const code = (err as { statusCode?: number }).statusCode;
            if (code !== 403 && code !== 404) {
                log.warn(
                    `    [Notice] Errore su chat ${chatId}: ${(err as Error).message}`,
                );
            }
        }
    }

    // ── Include previously collected files that had no new messages ──────────
    const outPathsArr = Array.from(outPathsSet);
    for (const [key] of Object.entries(meta)) {
        if (key === ".meta") continue;
        const filePath = path.join(TEAMS_DIR, `${key}.json`);
        if (!outPathsSet.has(filePath)) {
            outPathsArr.push(filePath);
        }
    }

    return outPathsArr;
}
