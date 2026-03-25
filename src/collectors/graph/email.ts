import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Client } from "@microsoft/microsoft-graph-client";
import {
  mergeByKey,
  readMeta,
  writeMeta,
  shouldSkipMonth,
  lastDayOfMonth,
} from "../utils";

const EMAIL_DIR = path.join(process.cwd(), "data", "raw", "graph-email");

export interface EmailRaw {
  id: string;
  subject: string;
  from: { emailAddress: { name: string; address: string } } | null;
  receivedDateTime: string;
  bodyPreview: string;
  webLink: string;
}

async function fetchMonthEmails(
  client: Client,
  month: string,
  top: number,
): Promise<EmailRaw[]> {
  const lastDay = lastDayOfMonth(month);
  const filter = `receivedDateTime ge ${month}-01T00:00:00Z and receivedDateTime le ${lastDay}T23:59:59Z`;

  const response = (await client
    .api("/me/messages")
    .filter(filter)
    .select("id,subject,from,receivedDateTime,bodyPreview,webLink")
    .orderby("receivedDateTime desc")
    .top(top)
    .get()) as { value: EmailRaw[] };

  return response.value ?? [];
}

export async function collectGraphEmail(
  client: Client,
  date?: string,
  force = false,
): Promise<string[]> {
  const since = process.env["COLLECT_SINCE"] ?? "2025-01-01";
  const top = Number(process.env["TOP"] ?? 500);
  const today = new Date().toISOString().slice(0, 10);

  await fs.mkdir(EMAIL_DIR, { recursive: true });

  const meta = await readMeta(EMAIL_DIR);
  const outPaths: string[] = [];

  if (date) {
    // Single-day mode: update only the file for that month
    const month = date.slice(0, 7);
    const isCurrentMonth = month === today.slice(0, 7);
    const outPath = path.join(EMAIL_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      console.log(`  [Email] ${month}: skip`);
      return [outPath];
    }

    const filter = `receivedDateTime ge ${date}T00:00:00Z and receivedDateTime le ${date}T23:59:59Z`;

    const response = (await client
      .api("/me/messages")
      .filter(filter)
      .select("id,subject,from,receivedDateTime,bodyPreview,webLink")
      .orderby("receivedDateTime desc")
      .top(top)
      .get()) as { value: EmailRaw[] };

    const emails = response.value ?? [];
    const merged = await mergeByKey<EmailRaw>(outPath, emails, "id");
    await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
    await writeMeta(EMAIL_DIR, month, {
      lastExtractedDate: today,
      sources: ["graph"],
    });
    return [outPath];
  }

  // Full-range mode: iterate months from COLLECT_SINCE to today
  const sinceDate = new Date(since);
  let current = new Date(sinceDate.getFullYear(), sinceDate.getMonth(), 1);
  const now = new Date();

  while (current <= now) {
    const year = current.getFullYear();
    const mo = current.getMonth() + 1;
    const month = `${year}-${String(mo).padStart(2, "0")}`;
    const isCurrentMonth = month === today.slice(0, 7);
    const outPath = path.join(EMAIL_DIR, `${month}.json`);

    if (
      !force &&
      !isCurrentMonth &&
      shouldSkipMonth(meta[month], month, ["graph"])
    ) {
      console.log(`  [Email] ${month}: skip`);
      outPaths.push(outPath);
    } else {
      try {
        const emails = await fetchMonthEmails(client, month, top);
        const merged = await mergeByKey<EmailRaw>(outPath, emails, "id");
        await fs.writeFile(outPath, JSON.stringify(merged, null, 2), "utf-8");
        await writeMeta(EMAIL_DIR, month, {
          lastExtractedDate: today,
          sources: ["graph"],
        });
        outPaths.push(outPath);
        console.log(`  [Email] ${month}: ${emails.length} email`);
      } catch (err) {
        console.warn(`  [Email] ${month}: ${(err as Error).message}`);
      }
    }

    current = new Date(year, mo, 1);
  }

  return outPaths;
}
