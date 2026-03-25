/**
 * Quick test: fetch Teams messages for a specific day and verify
 * that the standup chat messages are retrievable.
 * Usage: npx tsx scripts/test-teams-thursday.ts [YYYY-MM-DD]
 */
import * as dotenv from "dotenv";
dotenv.config();

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createGraphClient } = require("../src/graphClient") as {
  createGraphClient: () => Promise<
    import("@microsoft/microsoft-graph-client").Client
  >;
};

const targetDate = process.argv[2] ?? "2026-03-05";

async function run(): Promise<void> {
  console.log(`\nTest fetch Teams messages — ${targetDate}\n`);

  const client = await createGraphClient();

  // Step 1: list all chats (paginate to get more than top=50)
  let allChats: Array<{ id: string; topic: string | null; chatType: string }> =
    [];
  let nextLink: string | null = null;

  do {
    const res = nextLink
      ? await client.api(nextLink).get()
      : await client
          .api("/me/chats")
          .select("id,topic,chatType,lastUpdatedDateTime")
          .top(50)
          .get();

    allChats = allChats.concat(res.value ?? []);
    nextLink = res["@odata.nextLink"] ?? null;
  } while (nextLink);

  console.log(`Totale chat trovate: ${allChats.length}`);
  console.log(
    `Chat di tipo 'meeting': ${allChats.filter((ch) => ch.chatType === "meeting").length}`,
  );

  // Step 2: find chats active on targetDate (lastUpdatedDateTime starts with target date)
  const activeOnDay = allChats.filter((ch: { lastUpdatedDateTime?: string }) =>
    ch.lastUpdatedDateTime?.startsWith(targetDate),
  );
  console.log(`Chat attive il ${targetDate}: ${activeOnDay.length}`);
  activeOnDay.forEach(
    (ch: {
      chatType: string;
      topic: string | null;
      lastUpdatedDateTime?: string;
    }) =>
      console.log(
        `  [${ch.chatType}] ${ch.topic ?? "(no topic)"} — ${ch.lastUpdatedDateTime}`,
      ),
  );

  // Step 2b: find chats that contain "stand" in topic
  const standupChats = allChats.filter((ch) =>
    ch.topic?.toLowerCase().includes("stand"),
  );
  console.log(`\nChat con "stand" nel topic: ${standupChats.length}`);
  standupChats.forEach((ch) =>
    console.log(`  [${ch.chatType}] ${ch.topic} — ${ch.id}`),
  );

  // Step 3: for each chat active on the target day, try fetching messages
  const chatsToCheck =
    activeOnDay.length > 0 ? activeOnDay : standupChats.slice(0, 5);
  console.log(
    `\nFetch messaggi per ${chatsToCheck.length} chat attive il ${targetDate}...`,
  );
  for (const chat of chatsToCheck) {
    console.log(`\n--- Chat: "${chat.topic}" (${chat.chatType}) ---`);

    // Approach A: server-side $filter on createdDateTime
    console.log("\n  [A] Tentativo con $filter server-side:");
    try {
      const res = await c
        .api(`/me/chats/${chat.id}/messages`)
        .filter(
          `createdDateTime ge ${targetDate}T00:00:00Z and createdDateTime le ${targetDate}T23:59:59Z`,
        )
        .top(50)
        .get();
      const msgs = res.value ?? [];
      console.log(`      → ${msgs.length} messaggi`);
      printMessages(msgs);
    } catch (err) {
      console.log(`      → Errore: ${(err as Error).message}`);
    }

    // Approach B: fetch last 50 messages and filter client-side
    console.log("\n  [B] Fetch top 50, filtro client-side:");
    try {
      const res = await c.api(`/me/chats/${chat.id}/messages`).top(50).get();
      const all = res.value ?? [];
      const msgs = all.filter((m: { createdDateTime?: string }) =>
        m.createdDateTime?.startsWith(targetDate),
      );
      console.log(
        `      → ${msgs.length}/${all.length} messaggi per ${targetDate}`,
      );
      printMessages(msgs);
    } catch (err) {
      console.log(`      → Errore: ${(err as Error).message}`);
    }
  }
}

function printMessages(
  msgs: Array<{
    createdDateTime?: string;
    messageType?: string;
    body?: { content?: string };
  }>,
): void {
  for (const m of msgs) {
    if (m.messageType === "unknownFutureValue") continue;
    const text = (m.body?.content ?? "")
      .replaceAll(/<[^>]+>/g, "") // strip HTML
      .replaceAll(/\s+/g, " ")
      .trim()
      .slice(0, 120);
    console.log(`      ${m.createdDateTime?.slice(11, 19)} | ${text}`);
  }
}

run().catch((err: Error) => {
  console.error("Errore:", err.message);
  process.exit(1);
});
