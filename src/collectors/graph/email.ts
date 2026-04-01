import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Client } from "@microsoft/microsoft-graph-client";
import { createLogger } from "../../logger";

const log = createLogger("graph-email");
import { mergeByKey, readMeta, writeMeta, shouldSkipMonth } from "../utils";
import { EmailRaw } from "@shared/aggregator";
import {
  dateToString,
  currentMonthString,
  startOfMonth,
  addMonths,
  getApiStartOfDay,
  getApiEndOfDay,
  extractMonthStr,
} from "@shared/dates";

const EMAIL_DIR = path.join(process.cwd(), "data", "raw", "graph-email");

interface GraphPage<T> {
  value: T[];
  "@odata.nextLink"?: string;
}

async function fetchEmails(
  client: Client,
  filter: string,
  maxItems: number,
): Promise<{ results: EmailRaw[]; excluded: EmailRaw[] }> {
  const results: EmailRaw[] = [];
  const excluded: EmailRaw[] = [];
  let nextLink: string | null = null;

  const excludeList = (process.env["EMAIL_EXCLUDE_ADDRESSES"] ?? "")
    .split(";")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  let pageNum = 1;
  do {
    const res = (
      nextLink
        ? await client.api(nextLink).get()
        : await client
            .api("/me/messages")
            .filter(filter)
            .select("id,subject,from,receivedDateTime,bodyPreview,webLink")
            .orderby("receivedDateTime desc")
            .top(Math.min(maxItems, 50))
            .get()
    ) as GraphPage<EmailRaw>;

    const page = res.value ?? [];
    let skippedCount = 0;
    for (const m of page) {
      const fromAddr = m.from?.emailAddress?.address?.toLowerCase();
      if (fromAddr && excludeList.includes(fromAddr)) {
        excluded.push(m);
        skippedCount++;
        continue;
      }
      results.push(m);
    }

    log.info(
      `    [Pagina ${pageNum++}] Scaricati ${page.length} messaggi (scartati: ${skippedCount}). Totale accumulato: ${results.length}`,
    );

    // Stop if we hit the cap or end of stream
    nextLink =
      results.length < maxItems ? (res["@odata.nextLink"] ?? null) : null;
    if (nextLink && results.length >= maxItems) {
      log.info(
        `    [Limit] Raggiunto limite massimo di ${maxItems} email per questo mese.`,
      );
      nextLink = null;
    }
  } while (nextLink);

  // LOG UNIVOCO MITTENTI (per facilitare popolamento excludeList nel .env)
  const allMessages = [...results, ...excluded];
  const uniqueSenders = new Set<string>();
  allMessages.forEach((m) => {
    const addr = m.from?.emailAddress?.address?.toLowerCase();
    if (addr) uniqueSenders.add(addr);
  });
  const sortedSenders = Array.from(uniqueSenders).sort();

  log.info(
    `    [Debug] Mittenti univoci trovati in questo range (${sortedSenders.length}):`,
  );
  sortedSenders.forEach((s) => log.debug(`      - ${s}`));

  return { results: results.slice(0, maxItems), excluded };
}

export async function collectGraphEmail(
  client: Client,
  date?: string,
  force = false,
): Promise<string[]> {
  const since = process.env["COLLECT_SINCE"] ?? "2025-01-01";
  const maxPerMonth = Number(process.env["EMAIL_PER_MONTH_MAX"] ?? 200);
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

    const filter = `receivedDateTime ge ${getApiStartOfDay(date)} and receivedDateTime le ${getApiEndOfDay(date)}`;
    const { results, excluded } = await fetchEmails(
      client,
      filter,
      effectiveMax,
    );

    const merged = await mergeByKey<EmailRaw>(outPath, results, "id");
    await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");

    if (excluded.length > 0) {
      const mergedExcl = await mergeByKey<EmailRaw>(exclPath, excluded, "id");
      await fs.writeFile(
        exclPath,
        JSON.stringify(mergedExcl, null, 2),
        "utf-8",
      );
    }

    log.info(
      `  [Graph] Email ${month}: ${results.length} effettive (+${excluded.length} scartate)`,
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
        const filter = `receivedDateTime ge ${getApiStartOfDay(month)} and receivedDateTime le ${getApiEndOfDay(month)}`;
        const { results, excluded } = await fetchEmails(
          client,
          filter,
          effectiveMax,
        );

        const merged = await mergeByKey<EmailRaw>(outPath, results, "id");
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");

        if (excluded.length > 0) {
          const mergedExcl = await mergeByKey<EmailRaw>(
            exclPath,
            excluded,
            "id",
          );
          await fs.writeFile(
            exclPath,
            JSON.stringify(mergedExcl, null, 2),
            "utf-8",
          );
        }

        await writeMeta(EMAIL_DIR, month, {
          lastExtractedDate: today,
          sources: ["graph"],
        });
        outPaths.push(outPath);
        log.info(
          `${month}: ${results.length} email (+${excluded.length} escluse)`,
        );
      } catch (err) {
        log.warn(`${month}: ${(err as Error).message}`);
      }
    }

    current = addMonths(current, 1);
  }

  return outPaths;
}
