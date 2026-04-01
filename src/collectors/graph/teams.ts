import * as fs from "node:fs/promises";
import * as path from "node:path";
import { Client } from "@microsoft/microsoft-graph-client";
import { createLogger } from "../../logger";

const log = createLogger("graph-teams");
import { mergeByKey, readMeta, writeMeta } from "../utils";
import { ChatState, TeamsMessageRaw } from "@shared/aggregator";
import { dateToString, extractMonthStr, getApiStartOfDay } from "@shared/dates";

const TEAMS_DIR = path.join(process.cwd(), "data", "raw", "graph-teams");
const CHAT_STATES_FILE = path.join(TEAMS_DIR, "chat-states.json");

function sanitizeFilename(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .replace(/[^a-zA-Z0-9\s-_]/g, "") // Remove symbols like #, @, (, ), etc.
    .trim()
    .replace(/\s+/g, "_")
    .replace(/_+/g, "_"); // Remove double underscores
}

function getChatPrefix(chatType: string): string {
  if (chatType === "oneOnOne") return "O2O";
  if (chatType === "group") return "GRP";
  if (chatType === "meeting") return "MET";
  return chatType.substring(0, 3).toUpperCase();
}

async function loadChatStates(): Promise<Record<string, ChatState>> {
  try {
    const raw = await fs.readFile(CHAT_STATES_FILE, "utf-8");
    return JSON.parse(raw) as Record<string, ChatState>;
  } catch {
    return {};
  }
}

async function saveChatStates(
  states: Record<string, ChatState>,
): Promise<void> {
  await fs.writeFile(
    CHAT_STATES_FILE,
    JSON.stringify(states, null, 2),
    "utf-8",
  );
}

/**
 * Fetch new/modified messages for a single chat using the server-side
 * $filter=lastModifiedDateTime gt <since> approach.
 * Returns messages sorted newest-first and the max lastModifiedDateTime seen.
 */
interface GraphPage<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

interface GraphChat {
  id: string;
  topic: string | null;
  chatType: string;
}

async function fetchChatMessagesSince(
  c: Client,
  chatId: string,
  since: string,
): Promise<{ messages: TeamsMessageRaw[]; maxLastModified: string }> {
  const messages: TeamsMessageRaw[] = [];
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
    ) as GraphPage<TeamsMessageRaw>;

    const page: TeamsMessageRaw[] = res.value ?? [];
    nextLink = res["@odata.nextLink"] ?? null;

    for (const m of page) {
      if (m.lastModifiedDateTime > maxLastModified) {
        maxLastModified = m.lastModifiedDateTime;
      }
    }

    messages.push(...page);
  } while (nextLink);

  return { messages, maxLastModified };
}

export async function collectGraphTeams(
  client: Client,
  date?: string,
  force = false,
): Promise<string[]> {
  const today = dateToString();

  await fs.mkdir(TEAMS_DIR, { recursive: true });

  // Load per-chat incremental state
  const chatStates = await loadChatStates();

  // TEAMS_CHAT_LIMIT: max number of chats to enumerate (sorted newest-first by Graph).
  // Graph returns chats ordered by lastUpdatedDateTime desc, so this naturally
  // keeps the most recently active ones. Default 200. Set to 0 for unlimited.
  const chatLimit = Number(process.env["TEAMS_CHAT_LIMIT"] ?? 200);

  const allChats: GraphChat[] = [];
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
    ) as GraphPage<GraphChat>;

    allChats.push(...(res.value ?? []));
    chatsNextLink =
      chatLimit === 0 || allChats.length < chatLimit
        ? (res["@odata.nextLink"] ?? null)
        : null;
  } while (chatsNextLink);

  // Apply hard cap after pagination
  if (chatLimit > 0 && allChats.length > chatLimit) allChats.splice(chatLimit);

  log.info(`  [Teams] ${allChats.length} chat trovate${chatLimit > 0 ? ` (limite: ${chatLimit})` : ""}`);

  let myName = "";
  try {
    const me = await client.api('/me').select('displayName').get();
    myName = me.displayName;
  } catch {
    // Silently ignore if we can't fetch the current user's name
  }

  // Collect all new messages, grouped by chat file
  const byChatFile = new Map<string, TeamsMessageRaw[]>();
  const updatedStates: Record<string, ChatState> = { ...chatStates };

  // In single-day mode narrow to the target month only for writing,
  const targetMonth = date ? extractMonthStr(date) : null;

  let chatIdx = 0;
  let accumulatedMessages = 0;
  const outPathsSet = new Set<string>();
  const meta = await readMeta(TEAMS_DIR);

  const flushProgress = async (isFinal = false) => {
    const files = Array.from(byChatFile.keys()).sort((a, b) => a.localeCompare(b));
    for (const fileName of files) {
      const outPath = path.join(TEAMS_DIR, `${fileName}.json`);
      const newMsgs = byChatFile.get(fileName) ?? [];
      if (newMsgs.length > 0) {
        const merged = await mergeByKey<TeamsMessageRaw>(outPath, newMsgs, "id");
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
        
        const activeDays = new Set<string>();
        for (const m of merged) {
            const cd = m.createdDateTime?.substring(0, 10);
            if (cd) activeDays.add(cd);
        }

        await writeMeta(TEAMS_DIR, fileName, { lastExtractedDate: today, sources: ["graph"], activeDays: Array.from(activeDays) });
        outPathsSet.add(outPath);
        if (!isFinal) log.info(`    [Progress] Salvati su disco ${newMsgs.length} messaggi per: ${fileName}`);
        else log.info(`  [Teams] ${fileName}: salvataggio finale completato (tot. ${merged.length} messaggi)`);
      }
    }
    await saveChatStates(updatedStates);
    byChatFile.clear();
    accumulatedMessages = 0;
  };

  for (const chat of allChats) {
    chatIdx++;
    // Determine the since threshold for this chat.
    const collectSince = process.env["TEAMS_COLLECT_SINCE"] ?? process.env["COLLECT_SINCE"] ?? "2025-01-01";
    const stored = chatStates[chat.id];
    let since = force
      ? collectSince
      : (stored?.lastModifiedDateTime ?? collectSince);

    if (since.length <= 10) {
      since = getApiStartOfDay(since);
    }

    try {
      const { messages, maxLastModified } = await fetchChatMessagesSince(
        client,
        chat.id,
        since,
      );

      if (messages.length === 0) {
        if (chatIdx % 50 === 0) log.info(`    [Progress] Analizzate ${chatIdx}/${allChats.length} chat...`);
        continue;
      }

      let finalChatName = chat.topic;
      if (!finalChatName && messages.length > 0) {
        for (const m of messages) {
          const u = (m.from as { user?: { displayName?: string } })?.user?.displayName;
          if (u && u !== myName) {
            finalChatName = u;
            break;
          }
        }
      }
      if (!finalChatName) finalChatName = "Unknown";
      
      const safeName = sanitizeFilename(finalChatName);
      const prefix = getChatPrefix(chat.chatType);
      const uniquePart = chat.id.split("@")[0] || chat.id;
      const hash = uniquePart.substring(uniquePart.length - 6);
      const fileName = `${prefix}__${safeName}__${hash}`;

      log.info(`    [Chat ${chatIdx}/${allChats.length}] ${finalChatName}: +${messages.length} messaggi`);

      for (const m of messages) {
        const msg: TeamsMessageRaw = {
          id: m.id,
          chatId: chat.id,
          chatType: chat.chatType,
          chatTopic: chat.topic,
          createdDateTime: m.createdDateTime,
          lastModifiedDateTime: m.lastModifiedDateTime,
          from: m.from,
          body: m.body,
          webUrl: m.webUrl ?? null,
          messageType: m.messageType,
        };

        const month = m.createdDateTime ? extractMonthStr(m.createdDateTime) : undefined;
        if (!month) continue;

        // In single-day mode only accumulate the relevant month
        if (targetMonth && month !== targetMonth) continue;

        if (!byChatFile.has(fileName)) byChatFile.set(fileName, []);
        byChatFile.get(fileName)!.push(msg);
        accumulatedMessages++;
      }

      // Advance stored state for this chat
      updatedStates[chat.id] = {
        lastModifiedDateTime: maxLastModified,
        topic: chat.topic,
        chatType: chat.chatType,
      };

      // Auto-flush memory aggressively to prevent heap bounds exits and lost progress
      if (accumulatedMessages >= 2000 || chatIdx % 50 === 0) {
        if (accumulatedMessages > 0) {
          log.info(`    [Progress] Auto-salvataggio intermedio (${accumulatedMessages} messaggi elaborati in batch)...`);
          await flushProgress(false);
        } else {
          // If 50 chats passed but zero messages, just flush the states
          await saveChatStates(updatedStates);
        }
      }
    } catch (err: unknown) {
      // Inaccessible chats (403/404): skip silently
      const code = (err as { statusCode?: number }).statusCode;
      if (code !== 403 && code !== 404) {
        log.warn(`    [Notice] Errore su chat ${chat.id}: ${(err as Error).message}`);
      }
    }
  }

  // Final flush for remaining chunks
  if (accumulatedMessages > 0) {
    await flushProgress(true);
  } else {
    // Still persist state just in case some updates didn't have messages
    await saveChatStates(updatedStates);
  }

  // Report months that already had no new messages
  const existingFiles = await fs.readdir(TEAMS_DIR).catch(() => [] as string[]);
  const outPathsArr = Array.from(outPathsSet);
  for (const f of existingFiles) {
    if (!f.endsWith(".json") || f === ".meta.json" || f === "chat-states.json") continue;
    const fnoext = f.replaceAll(".json", "");
    const finalP = path.join(TEAMS_DIR, f);
    if (!outPathsSet.has(finalP) && meta[fnoext]) {
      // Silent pass for non-updated chats to avoid log spam
      outPathsArr.push(finalP);
    }
  }

  return outPathsArr;
}
