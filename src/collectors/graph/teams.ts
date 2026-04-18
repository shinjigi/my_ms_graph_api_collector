import { mkdir } from "node:fs/promises";
import * as path from "node:path";
import { Client } from "@microsoft/microsoft-graph-client";
import { Chat, ChatMessage } from "@microsoft/microsoft-graph-types";
import { createLogger } from "../../logger";
import { readJson, writeJson, readMeta, writeMeta } from "../../json-io";
import { dateToString, extractMonthStr, getApiStartOfDay } from "@shared/dates";
import { GraphPage, mapToLeanMessage, TeamsChatDataRaw, TeamsChatMessageRaw } from "@shared/graph";
import { CONFIG } from "@shared/env-config";

interface ChatProcessParams {
    client: Client;
    chat: Chat;
    idx: number;
    total: number;
    force: boolean;
    collectSince: string;
    targetMonth: string | null;
    myName: string;
}

const log = createLogger("graph-teams");

const TEAMS_DIR = path.join(process.cwd(), "data", "raw", "graph-teams");

// ─── Filename helpers ───────────────────────────────────────────────────────

function sanitizeFilename(name: string): string {
    return name
        .normalize("NFD")
        .replaceAll(/[\u0300-\u036f]/g, "") // Remove accents
        .replaceAll(/[^a-zA-Z0-9\s-_]/g, "") // Remove symbols like #, @, (, ), etc.
        .trim()
        .replaceAll(/\s+/g, "_")
        .replaceAll(/_+/g, "_"); // Collapse double underscores
}

function getChatPrefix(chatType: string): string {
    if (chatType === "oneOnOne") return "O2O";
    if (chatType === "group") return "GRP";
    if (chatType === "meeting") return "MET";
    return chatType.substring(0, 3).toUpperCase();
}

/**
 * Builds the stable filename stem for a single chat.
 * Pattern: <PREFIX>__<sanitized topic>__<last 6 chars of chat id>
 */
function buildChatFileName(chatId: string, chatType: string, topic: string): string {
    const safeName = sanitizeFilename(topic);
    const prefix = getChatPrefix(chatType);
    const uniquePart = chatId.split("@")[0] || chatId;
    const hash = uniquePart.substring(uniquePart.length - 6);
    return `${prefix}__${safeName}__${hash}`;
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

// ─── Sub-collection helpers ──────────────────────────────────────────────────

async function listAllChats(client: Client, chatLimit: number): Promise<Chat[]> {
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
    return allChats;
}

async function getCurrentUserName(client: Client): Promise<string> {
    try {
        const me = await client.api("/me").select("displayName").get();
        return me.displayName || "";
    } catch {
        return "";
    }
}

function resolveTopic(chat: Chat, rawMessages: ChatMessage[], myName: string): string {
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
    return resolvedTopic || "Unknown";
}

function mapAndFilterMessages(
    rawMessages: ChatMessage[],
    targetMonth: string | null,
): TeamsChatMessageRaw[] {
    const lean: TeamsChatMessageRaw[] = [];
    for (const m of rawMessages) {
        if (!m.createdDateTime) continue;
        const mMonth = extractMonthStr(m.createdDateTime);
        if (targetMonth && mMonth !== targetMonth) continue;
        lean.push(mapToLeanMessage(m));
    }
    return lean;
}

function mergeChatMessages(
    existing: TeamsChatMessageRaw[],
    newItems: TeamsChatMessageRaw[],
): TeamsChatMessageRaw[] {
    const msgMap = new Map<string, TeamsChatMessageRaw>();
    for (const m of existing ?? []) msgMap.set(m.id, m);
    for (const m of newItems) msgMap.set(m.id, m);
    return Array.from(msgMap.values()).sort((a, b) => {
        try {
            return new Date(b?.createdDateTime).getTime() - new Date(a?.createdDateTime).getTime();
        } catch {
            log.warn(
                `    [Warning] Invalid date format in messages ${a.id} '${b?.createdDateTime}' or ${b.id} '${a?.createdDateTime}', defaulting to no order.`,
            );
            return 0;
        }
    });
}

async function updateChatMeta(TEAMS_DIR: string, fileName: string, merged: TeamsChatMessageRaw[]) {
    const activeDays = new Set<string>();
    for (const m of merged) {
        const cd = m.createdDateTime?.substring(0, 10);
        if (cd) activeDays.add(cd);
    }
    await writeMeta(TEAMS_DIR, fileName, {
        lastExtractedDate: dateToString(),
        sources: ["graph"],
        activeDays: Array.from(activeDays),
    });
}

async function processSingleChat({
    client,
    chat,
    idx,
    total,
    force,
    collectSince,
    targetMonth,
    myName,
}: ChatProcessParams): Promise<string | null> {
    const chatId = chat.id ?? "0";
    if (chatId === "0") return null;

    const prelimTopic = chat.topic ?? `(no topic) ${chatId.slice(25, 35)}`;
    const fileName = buildChatFileName(chatId, chat.chatType ?? "unknown", prelimTopic);
    const outPath = path.join(TEAMS_DIR, `${fileName}.json`);

    const existing = await readJson<TeamsChatDataRaw>(outPath, {
        chatId,
        chatTopic: null,
        chatType: chat.chatType ?? "unknown",
        lastModifiedDateTime: collectSince,
        messages: [],
    });

    let since = force ? collectSince : existing.lastModifiedDateTime;
    if (since.length <= 10) since = getApiStartOfDay(since);

    try {
        const { messages: rawMessages, maxLastModified } = await fetchChatMessagesSince(
            client,
            chatId,
            since,
        );

        if (rawMessages.length === 0) {
            if (idx % 50 === 0) log.info(`    [Progress] Analizzate ${idx}/${total} chat...`);
            return null;
        }

        const resolvedTopic = resolveTopic(chat, rawMessages, myName);
        log.info(`    [Chat ${idx}/${total}] ${resolvedTopic}: +${rawMessages.length} messaggi`);

        const newLean = mapAndFilterMessages(rawMessages, targetMonth);
        if (newLean.length === 0) return null;

        const merged = mergeChatMessages(existing.messages, newLean);

        await writeJson(outPath, {
            chatId,
            chatTopic: resolvedTopic,
            chatType: chat.chatType ?? "unknown",
            lastModifiedDateTime: maxLastModified,
            messages: merged,
        });

        await updateChatMeta(TEAMS_DIR, fileName, merged);

        if (idx % 50 === 0) log.info(`    [Progress] Analizzate ${idx}/${total} chat...`);
        return outPath;
    } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code !== 403 && code !== 404) {
            log.warn(`    [Notice] Errore su chat ${chatId}: ${(err as Error).message}`);
        } else {
            log.error(`    [Error] Impossibile accedere alla chat ${chatId} (status ${code}). Potrebbe essere stata eliminata o potresti non avere più accesso. Se il problema persiste, considerando di escludere questa chat o di rimuovere il limite di chat per continuare a raccogliere le altre. Errore: ${(err as Error).message}`);
        }
        return null;
    }
}

// ─── Main collector ─────────────────────────────────────────────────────────

export async function collectGraphTeams(
    client: Client,
    date?: string,
    force = false,
): Promise<string[]> {
    await mkdir(TEAMS_DIR, { recursive: true });

    const chatLimit = CONFIG.TEAMS_CHAT_LIMIT;
    const allChats = await listAllChats(client, chatLimit);

    const limitInfo = chatLimit > 0 ? ` (limite: ${chatLimit})` : "";
    log.info(`  [Teams] ${allChats.length} chat trovate${limitInfo}`);

    const myName = await getCurrentUserName(client);
    const targetMonth = date ? extractMonthStr(date) : null;
    const collectSince = CONFIG.COLLECT_SINCE;

    const outPathsSet = new Set<string>();
    const meta = await readMeta(TEAMS_DIR);

    for (let i = 0; i < allChats.length; i++) {
        const outPath = await processSingleChat({
            client,
            chat: allChats[i],
            idx: i + 1,
            total: allChats.length,
            force,
            collectSince,
            targetMonth,
            myName,
        });
        if (outPath) outPathsSet.add(outPath);
    }

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
