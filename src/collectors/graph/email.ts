import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Client } from "@microsoft/microsoft-graph-client";
import  { Message } from "@microsoft/microsoft-graph-types";
import { createLogger } from "../../logger";

const log = createLogger("graph-email");
import { mergeByKey, readMeta, writeMeta, shouldSkipMonth, writeJson } from "../../utils";
import {
  dateToString,
  currentMonthString,
  startOfMonth,
  addMonths,
  getApiStartOfDay,
  getApiEndOfDay,
  extractMonthStr,
} from "@shared/dates";
import { GraphPage, mapToLeanEmail, EmailRaw } from "@shared/graph";
import { CONFIG } from "@shared/env-config";

const EMAIL_DIR = path.join(process.cwd(), "data", "raw", "graph-email");

async function fetchEmails(
  client: Client,
  filter: string,
  direction: "received" | "sent",
  maxItems: number,
): Promise<{ results: EmailRaw[]; excluded: Message[] }> {
  const results: EmailRaw[] = [];
  const excluded: Message[] = [];
  let nextLink: string | null = null;

  const excludeList = (CONFIG.EMAIL_EXCLUDE_ADDRESSES)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const endpoint =
    direction === "sent"
      ? "/me/mailFolders/sentItems/messages"
      : "/me/messages";
  const dateField = direction === "sent" ? "sentDateTime" : "receivedDateTime";
  const selectFields =
    direction === "sent"
      ? "id,subject,from,toRecipients,sentDateTime,body,bodyPreview,webLink"
      : "id,subject,from,toRecipients,receivedDateTime,body,bodyPreview,webLink";

  let pageNum = 1;
  do {
    const res = (
      nextLink
        ? await client.api(nextLink).get()
        : await client
            .api(endpoint)
            .filter(filter)
            .select(selectFields)
            .orderby(`${dateField} desc`)
            .top(Math.min(maxItems, 50))
            .get()
    ) as GraphPage<Message>;

    const page = res.value ?? [];
    let skippedCount = 0;
    for (const m of page) {
      if ((m as { "@odata.type": string })["@odata.type"] === "#microsoft.graph.eventMessageResponse"){
        continue; // Escludiamo i messaggi di risposta agli inviti calendar (eventMessageResponse)
      }
      
      if (direction === "received") {
        const fromAddr = m.from?.emailAddress?.address?.toLowerCase();
        if (fromAddr && excludeList.includes(fromAddr)) {
          excluded.push(m);
          skippedCount++;
          continue;
        }  
      }  
      const mapped = mapToLeanEmail(m, direction);
      
      results.push(mapped);
    }

    log.info(
      `    [Pagina ${pageNum++}] Scaricati ${page.length} messaggi ${direction} (scartati: ${skippedCount}). Totale: ${results.length}`,
    );

    nextLink =
      results.length < maxItems ? (res["@odata.nextLink"] ?? null) : null;
    if (nextLink && results.length >= maxItems) {
      log.info(
        `    [Limit] Raggiunto limite massimo di ${maxItems} email per questo mese.`,
      );
      nextLink = null;
    }
  } while (nextLink);

  if (direction === "received") {
    const uniqueSenders = new Set<string>();
    results.forEach((m) => {
      // Per il debug usiamo la stringa 'from' appiattita
      uniqueSenders.add(m.from.toLowerCase());
    });
    excluded.forEach((m) => {
      // Per il debug usiamo la stringa 'from' appiattita
      uniqueSenders.add(m.from?.emailAddress?.address?.toLowerCase() || "unknown");
    });
    const sortedSenders = Array.from(uniqueSenders).sort((a, b) => a.localeCompare(b));
    log.info(
      `    [Debug] Mittenti univoci trovati in questo range (${sortedSenders.length}):`,
    );
    sortedSenders.forEach((s) => log.debug(`      - ${s}`));
  }

  return { results: results.slice(0, maxItems), excluded };
}

export async function collectGraphEmail(
  client: Client,
  date?: string,
  force = false,
): Promise<string[]> {
  const since = CONFIG.COLLECT_SINCE;
  const maxPerMonth = Number(CONFIG.EMAIL_PER_MONTH_MAX);
  const effectiveMax = maxPerMonth === 0 ? Infinity : maxPerMonth;
  const today = dateToString();

  await fs.mkdir(EMAIL_DIR, { recursive: true });

  const meta = await readMeta(EMAIL_DIR);
  const outPaths: string[] = [];

  if (date) {
    const month = extractMonthStr(date);
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(EMAIL_DIR, `${month}.json`);
    const exclPath = path.join(EMAIL_DIR, `${month}.excluded.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      log.info(`${month}: skip`);
      return [outPath];
    }

    const receivedFilter = `receivedDateTime ge ${getApiStartOfDay(date)} and receivedDateTime le ${getApiEndOfDay(date)}`;
    const sentFilter = `sentDateTime ge ${getApiStartOfDay(date)} and sentDateTime le ${getApiEndOfDay(date)}`;
    const [
      { results: received, excluded },
      { results: sent },
    ] = await Promise.all([
      fetchEmails(client, receivedFilter, "received", effectiveMax),
      fetchEmails(client, sentFilter, "sent", effectiveMax),
    ]);

    const combined = [...received, ...sent];
    const merged = await mergeByKey<EmailRaw>(outPath, combined, "id");
    await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");

    if (excluded.length > 0) {
      const mergedExcl = await mergeByKey<Message>(exclPath, excluded, "id");
      await writeJson(exclPath, mergedExcl);
    }

    log.info(
      `  [Graph] Email ${month}: ${received.length} ricevute + ${sent.length} inviate (+${excluded.length} scartate)`,
    );
    await writeMeta(EMAIL_DIR, month, {
      lastExtractedDate: today,
      sources: ["graph"],
    });
    return [outPath];
  }

  // Full-range mode: iterate months from COLLECT_SINCE to today
  let current = startOfMonth(since);
  const now = new Date();

  while (current <= now) {
    const month = currentMonthString(current);
    const isCurrentMonth = month === currentMonthString();
    const outPath = path.join(EMAIL_DIR, `${month}.json`);
    const exclPath = path.join(EMAIL_DIR, `${month}.excluded.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      log.info(`${month}: skip`);
      outPaths.push(outPath);
    } else {
      try {
        const receivedFilter = `receivedDateTime ge ${getApiStartOfDay(month)} and receivedDateTime le ${getApiEndOfDay(month)}`;
        const sentFilter = `sentDateTime ge ${getApiStartOfDay(month)} and sentDateTime le ${getApiEndOfDay(month)}`;
        const [
          { results: received, excluded },
          { results: sent },
        ] = await Promise.all([
          fetchEmails(client, receivedFilter, "received", effectiveMax),
          fetchEmails(client, sentFilter, "sent", effectiveMax),
        ]);

        const combined = [...received, ...sent];
        const merged = await mergeByKey<EmailRaw>(outPath, combined, "id");
        await writeJson(outPath, merged);

        if (excluded.length > 0) {
          const mergedExcl = await mergeByKey<Message>(
            exclPath,
            excluded,
            "id",
          );
          await writeJson(exclPath, mergedExcl);
        }

        await writeMeta(EMAIL_DIR, month, {
          lastExtractedDate: today,
          sources: ["graph"],
        });
        outPaths.push(outPath);
        log.info(
          `${month}: ${received.length} ricevute + ${sent.length} inviate (+${excluded.length} escluse)`,
        );
      } catch (err) {
        log.warn(`${month}: ${(err as Error).message}`);
      }
    }

    current = addMonths(current, 1);
  }

  return outPaths;
}
