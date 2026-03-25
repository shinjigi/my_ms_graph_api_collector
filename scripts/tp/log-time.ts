import { TargetprocessClient } from "./client";

// Usage: npm run tp:log-time -- <usId> <hours> <description> [YYYY-MM-DD]
const US_ID = Number.parseInt(process.argv[2] ?? "", 10);
const SPENT = Number.parseFloat(process.argv[3] ?? "");
const DESCRIPTION = process.argv[4] ?? "";
const DATE = process.argv[5] ?? undefined; // defaults to today

if (!US_ID || Number.isNaN(SPENT) || !DESCRIPTION) {
  console.error(
    'Usage: npm run tp:log-time -- <usId> <hours> "<description>" [YYYY-MM-DD]',
  );
  console.error('  Example: npm run tp:log-time -- 324911 0.5 "standup"');
  process.exit(1);
}

async function main(): Promise<void> {
  try {
    const client = new TargetprocessClient();
    const result = await client.logTime({
      usId: US_ID,
      spent: SPENT,
      description: DESCRIPTION,
      date: DATE,
    });

    console.log(`✓ Time logged`);
    console.log(`  ID:          ${result.id}`);
    console.log(`  Date:        ${result.date}`);
    console.log(`  Hours:       ${result.spent}h`);
    console.log(`  Description: ${result.description}`);
    console.log(`  User:        ${result.user}`);
    console.log(`  US:          ${result.assignable}`);
  } catch (error) {
    console.error("Errore durante il log delle ore:");
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
