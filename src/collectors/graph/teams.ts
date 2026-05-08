import { mkdir, unlink } from "node:fs/promises";
import * as path from "node:path";
import { Client } from "@microsoft/microsoft-graph-client";
import { Chat, ChatMessage } from "@microsoft/microsoft-graph-types";
import { createLogger } from "../../logger";
import { readJson, writeJson, readMeta, writeMeta, getJsonRawPath } from "../../json-io";
import { DateRange, dateToString, parseDateString, isAfter } from "@shared/dates";
import { GraphPage, mapToLeanMessage, TeamsChatDataRaw, TeamsChatMessageRaw } from "@shared/graph";
import { CONFIG } from "@shared/env-config";

interface ChatProcessParams {
    client: Client;
    chat: Chat;
    idx: number;
    total: number;
    range: DateRange;
    myName: string;
    force: boolean;
}

const log = createLogger("graph-teams");

const TEAMS_DIR = getJsonRawPath("graph-teams");

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
 * Fetch messages for a single chat within a specific range.
 * If 'until' is not provided, fetches all messages after 'since'.
 */
async function fetchChatMessagesRange(
    c: Client,
    chatId: string,
    since: Date,
    until?: Date,
): Promise<{ messages: ChatMessage[]; maxLastModified: Date }> {
    const messages: ChatMessage[] = [];
    let maxLastModified = since;
    let nextLink: string | null = null;

    const filter = until
        ? `lastModifiedDateTime gt ${since.toISOString()} and lastModifiedDateTime lt ${until.toISOString()}`
        : `lastModifiedDateTime gt ${since.toISOString()}`;

    do {
        const res = (
            nextLink
                ? await c.api(nextLink).get()
                : await c
                      .api(`/me/chats/${chatId}/messages`)
                      .orderby("lastModifiedDateTime desc")
                      .filter(filter)
                      .top(50)
                      .get()
        ) as GraphPage<ChatMessage>;

        const page: ChatMessage[] = res.value ?? [];
        nextLink = res["@odata.nextLink"] ?? null;

        for (const m of page) {
            if (
                m.lastModifiedDateTime &&
                isAfter(parseDateString(m.lastModifiedDateTime), maxLastModified)
            ) {
                maxLastModified = parseDateString(m.lastModifiedDateTime);
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

function mapAndFilterMessages(rawMessages: ChatMessage[], range: DateRange): TeamsChatMessageRaw[] {
    const lean: TeamsChatMessageRaw[] = [];
    for (const m of rawMessages) {
        if (!m.createdDateTime) continue;
        const createdDate = parseDateString(m.createdDateTime);
        if (range.start && isAfter(range.start, createdDate)) continue;
        if (range.end && isAfter(createdDate, range.end)) continue;
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
    const toMs = (d: Date | string | null | undefined) => (d ? parseDateString(d).getTime() : 0);
    return Array.from(msgMap.values()).sort((a, b) => toMs(b.createdDateTime) - toMs(a.createdDateTime));
}

async function updateChatMeta(TEAMS_DIR: string, fileName: string, merged: TeamsChatMessageRaw[]) {
    const activeDays = new Set<string>();
    for (const m of merged) {
        const cd = dateToString(m.createdDateTime);
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
    range,
    myName,
    force,
}: ChatProcessParams): Promise<string | null> {
    const chatId = chat.id ?? "0";
    if (chatId === "0") return null;

    const chatType = chat.chatType ?? "unknown";
    const defaultChat: TeamsChatDataRaw = {
        chatId,
        chatTopic: null,
        chatType,
        lastModifiedDateTime: range.end,
        messages: [],
    };

    // Preliminary path — used to migrate old files written before topic was resolved
    const prelimFileName = buildChatFileName(
        chatId,
        chatType,
        chat.topic ?? `(no topic) ${chatId.slice(25, 35)}`,
    );
    const prelimPath = path.join(TEAMS_DIR, `${prelimFileName}.json`);
    const prelimExisting = await readJson<TeamsChatDataRaw>(prelimPath, defaultChat);

    // Recuperiamo il timestamp locale tramite le utility condivise
    const localLastModified = prelimExisting.lastModifiedDateTime
        ? parseDateString(prelimExisting.lastModifiedDateTime)
        : null;

    // 1. Ottimizzazione: se la chat non è cambiata lato Microsoft e non siamo in --force, saltiamo
    if (!force && localLastModified && chat.lastUpdatedDateTime) {
        const remoteLastModified = parseDateString(chat.lastUpdatedDateTime);
        if (!isAfter(remoteLastModified, localLastModified)) {
            if (idx % 50 === 0) log.info(`    [Progress] Analizzate ${idx}/${total} chat...`);
            return prelimPath;
        }
    }

    // 2. Recupero incrementale: partiamo dall'ultimo messaggio che abbiamo o dal range.start
    const fetchSince =
        !force && localLastModified && isAfter(localLastModified, range.start)
            ? localLastModified
            : range.start;

    try {
        const { messages: rawMessages, maxLastModified } = await fetchChatMessagesRange(
            client,
            chatId,
            fetchSince,
            range.end,
        );

        if (rawMessages.length === 0) {
            if (idx % 50 === 0) log.info(`    [Progress] Analizzate ${idx}/${total} chat...`);
            return prelimPath;
        }

        const resolvedTopic = resolveTopic(chat, rawMessages, myName);
        const isIncremental = localLastModified && isAfter(fetchSince, range.start);
        log.info(
            `    [Chat ${idx}/${total}] ${resolvedTopic}: +${rawMessages.length} messaggi${isIncremental ? " (nuovi)" : ""}`,
        );

        const newLean = mapAndFilterMessages(rawMessages, range);
        if (newLean.length === 0) return null;

        const resolvedFileName = buildChatFileName(chatId, chatType, resolvedTopic);
        const resolvedPath = path.join(TEAMS_DIR, `${resolvedFileName}.json`);

        // If topic resolved to a different filename, also read from the resolved path
        // (may already contain data from a prior correct run), then merge all three sources
        const resolvedExisting =
            resolvedPath !== prelimPath
                ? await readJson<TeamsChatDataRaw>(resolvedPath, defaultChat)
                : prelimExisting;
        const allExisting =
            resolvedPath !== prelimPath
                ? mergeChatMessages(prelimExisting.messages, resolvedExisting.messages)
                : prelimExisting.messages;

        const merged = mergeChatMessages(allExisting, newLean);

        await writeJson(resolvedPath, {
            chatId,
            chatTopic: resolvedTopic,
            chatType,
            lastModifiedDateTime: maxLastModified,
            messages: merged,
        });

        await updateChatMeta(TEAMS_DIR, resolvedFileName, merged);

        // Remove stale preliminary file after successful migration
        if (resolvedPath !== prelimPath) {
            try {
                await unlink(prelimPath);
            } catch {
                /* file may not exist */
            }
        }

        if (idx % 50 === 0) log.info(`    [Progress] Analizzate ${idx}/${total} chat...`);
        return resolvedPath;
    } catch (err: unknown) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code !== 403 && code !== 404) {
            log.warn(`    [Notice] Errore su chat ${chatId}: ${(err as Error).message}`);
        } else {
            log.error(
                `    [Error] Impossibile accedere alla chat ${chatId} (status ${code}). Potrebbe essere stata eliminata o potresti non avere più accesso. Se il problema persiste, considerando di escludere questa chat o di rimuovere il limite di chat per continuare a raccogliere le altre. Errore: ${(err as Error).message}`,
            );
        }
        return null;
    }
}

// ─── Main collector ─────────────────────────────────────────────────────────

export async function collectGraphTeams(
    client: Client,
    range: DateRange | undefined,
    _force = false,
): Promise<string[]> {
    await mkdir(TEAMS_DIR, { recursive: true });

    const effectiveRange: DateRange = range ?? {
        start: CONFIG.COLLECT_SINCE,
        end: new Date(),
    };

    const chatLimit = CONFIG.TEAMS_CHAT_LIMIT;
    const allChats = await listAllChats(client, chatLimit);

    const limitInfo = chatLimit > 0 ? ` (limite: ${chatLimit})` : "";
    log.info(`  [Teams] ${allChats.length} chat trovate${limitInfo}`);

    const myName = await getCurrentUserName(client);

    const outPathsSet = new Set<string>();
    const meta = await readMeta(TEAMS_DIR);

    for (let i = 0; i < allChats.length; i++) {
        const outPath = await processSingleChat({
            client,
            chat: allChats[i],
            idx: i + 1,
            total: allChats.length,
            range: effectiveRange,
            myName,
            force: _force,
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
