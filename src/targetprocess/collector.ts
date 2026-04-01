/**
 * TargetProcess Knowledge Base collector — unified provider chain.
 *
 * Claude API (primary) → Gemini (fallback).  Mirrors the analyzer.ts pattern.
 *
 * Usage:
 *   tsx src/targetprocess/collector.ts --update-kb
 *   tsx src/targetprocess/collector.ts --update-kb --force
 *   tsx src/targetprocess/collector.ts --update-kb --provider=claude|gemini
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config();

import { createLogger } from "../logger";
import { saveRawResponse } from "../aiRaw";
import { TargetprocessClient } from "./client";
import { dateToString, getISOTimestamp } from "@shared/dates";
import { AnalysisPrompts } from "./prompts";
import type { KbEntry, KbStore } from "@shared/kb";
import { parseTpDate, nameSet, nameSetHas } from "./format";
import {
  TpOpenItem,
  TpUserStat,
  TpTimeEntry,
  TpAssignmentEntry,
} from "@shared/targetprocess";

const logger = createLogger("collector");

// ─── Resilience helpers ───────────────────────────────────────────────────────

/** Retry with exponential backoff; detects HTTP 429 / rate-limit messages. */
async function withRetry<T>(
  fn: () => Promise<T>,
  maxAttempts = 3,
  baseDelayMs = 2_000,
): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxAttempts) throw err;
      const msg = ((err as Error).message ?? "").toLowerCase();
      const isRateLimit =
        msg.includes("429") ||
        msg.includes("rate limit") ||
        msg.includes("too many");
      const delay = isRateLimit
        ? 60_000
        : baseDelayMs * Math.pow(2, attempt - 1);
      logger.warn(
        `Tentativo ${attempt}/${maxAttempts} fallito: ${(err as Error).message}. Retry tra ${delay}ms...`,
      );
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw new Error("unreachable");
}

/** Extract JSON from an AI response, stripping markdown fences and using regex as fallback. */
function extractJson(text: string): unknown {
  const attempts: (() => unknown)[] = [
    () => JSON.parse(text),
    () =>
      JSON.parse(
        text
          .replaceAll(/```json\s*/g, "")
          .replaceAll("```", "")
          .trim(),
      ),
    () => {
      const m = new RegExp(/(\{[\s\S]*\}|\[[\s\S]*\])/).exec(text);
      if (m) return JSON.parse(m[1]);
      throw new Error("no match");
    },
  ];
  for (const attempt of attempts) {
    try {
      return attempt();
    } catch {
      /* try next */
    }
  }
  throw new Error(
    `Impossibile estrarre JSON dalla risposta: ${text.slice(0, 120)}...`,
  );
}

// ─── Paths ───────────────────────────────────────────────────────────────────
const KB_DIR = path.join(process.cwd(), "data", "kb");
const KB_FILE = path.join(KB_DIR, "us-summaries.json");
const ENRICHED_DIR = path.join(process.cwd(), "data", "raw", "targetprocess");

// ─── Priority colleagues ──────────────────────────────────────────────────────
const COLLEAGUES_PRIORITY = nameSet([
  "Flavio Passera",
  "Marco Anselmo",
  "Michela Della Misericordia",
  "Susanna Castelletti",
  "Nicola Achille",
  "Chiara Bonasi",
  "Sara Fiano",
  "Marcella Nardone",
  "Matteo D'Amario",
  "Team ITA Web",
]);

// ─── Types ───────────────────────────────────────────────────────────────────

export interface EnrichedItem {
  item: TpOpenItem;
  stats: TpUserStat[];
  logs: TpTimeEntry[];
  priority: number;
}

interface EnrichedStore {
  savedAt: string;
  userId: number;
  userName: string;
  items: EnrichedItem[];
}

// ─── Provider interface ───────────────────────────────────────────────────────
export interface KbCollectorProvider {
  readonly name: string;
  isAvailable(): boolean;
  /** Mutates kbMap in-place; may persist intermediate saves for resilience. */
  collect(items: EnrichedItem[], kbMap: Map<number, KbEntry>): Promise<void>;
}

// ─── Persistence ──────────────────────────────────────────────────────────────
async function loadKb(): Promise<KbStore> {
  try {
    const raw = await fs.readFile(KB_FILE, "utf-8");
    return JSON.parse(raw) as KbStore;
  } catch {
    return { updatedAt: "", items: [] };
  }
}

export async function saveKb(items: KbEntry[]): Promise<void> {
  await fs.mkdir(KB_DIR, { recursive: true });
  const store: KbStore = { updatedAt: getISOTimestamp(), items };
  await fs.writeFile(KB_FILE, JSON.stringify(store, null, 2), "utf-8");
}

async function saveEnriched(
  items: EnrichedItem[],
  userId: number,
  userName: string,
): Promise<string> {
  await fs.mkdir(ENRICHED_DIR, { recursive: true });
  const today = dateToString();
  const outPath = path.join(ENRICHED_DIR, `enriched-${today}.json`);
  const store: EnrichedStore = {
    savedAt: getISOTimestamp(),
    userId,
    userName,
    items,
  };
  await fs.writeFile(outPath, JSON.stringify(store, null, 2), "utf-8");
  return outPath;
}

async function loadEnriched(
  filePath: string,
): Promise<{ items: EnrichedItem[]; userId: number; userName: string }> {
  const raw = await fs.readFile(filePath, "utf-8");
  const store = JSON.parse(raw) as EnrichedStore;
  return { items: store.items, userId: store.userId, userName: store.userName };
}

// ─── Batch Provider Base ─────────────────────────────────────────────────────
abstract class BatchKbProvider implements KbCollectorProvider {
  abstract readonly name: string;

  protected readonly maxTpm: number;
  protected readonly tpmThreshold = 0.8;

  constructor(maxTpm: number) {
    this.maxTpm = maxTpm;
  }

  abstract isAvailable(): boolean;

  async collect(
    items: EnrichedItem[],
    kbMap: Map<number, KbEntry>,
  ): Promise<void> {
    let batch: EnrichedItem[] = [];
    let batchTokens = 0;
    let totalBatches = 0;
    let failedBatches = 0;

    const flush = async (): Promise<void> => {
      if (batch.length === 0) return;
      totalBatches++;
      const batchNum = totalBatches;
      try {
        await withRetry(() => this.processBatch(batch, kbMap, batchNum));
      } catch (err) {
        failedBatches++;
        logger.error(
          `[${this.name}] batch ${batchNum} fallito: ${(err as Error).message}`,
        );
      }
      batch = [];
      batchTokens = 0;
    };

    for (const element of items) {
      const entry = element;
      const itemTokens = Math.ceil(JSON.stringify(entry).length / 4);

      if (
        batch.length > 0 &&
        batchTokens + itemTokens > this.maxTpm * this.tpmThreshold
      ) {
        await flush();
        await new Promise((r) => setTimeout(r, 10_000));
      }

      batch.push(entry);
      batchTokens += itemTokens;
    }

    await flush();

    if (failedBatches > 0 && failedBatches === totalBatches) {
      throw new Error(
        `Tutti i batch falliti (${failedBatches}/${totalBatches})`,
      );
    }
    if (failedBatches > 0) {
      logger.warn(
        `[${this.name}] ${failedBatches}/${totalBatches} batch falliti — risultati parziali salvati.`,
      );
    }
  }

  protected abstract processBatch(
    batch: EnrichedItem[],
    kbMap: Map<number, KbEntry>,
    batchNum: number,
  ): Promise<void>;
}

interface AiResultItem {
  id: number;
  summary?: string;
  tags?: string[];
  userActivities?: Record<string, string>;
  stakeholders?: string[];
  stakeholder?: string[];
}

/** Maps AI result objects back to enriched items and writes to kbMap. */
function applyResults(
  batch: EnrichedItem[],
  data: unknown,
  kbMap: Map<number, KbEntry>,
): void {
  const dataObj = data as { results?: AiResultItem[] } | AiResultItem[];
  const results: AiResultItem[] = Array.isArray(dataObj)
    ? dataObj
    : (dataObj.results ?? []);
  const batchIds = new Set(batch.map((b) => b.item.id));

  for (const result of results) {
    const original = batch.find((b) => b.item.id === result.id);
    if (!original) {
      logger.warn(
        `applyResults: ID ${result.id} non presente nel batch — ignorato`,
      );
      continue;
    }
    const timeEntryDates = original.logs
      .map((l) => parseTpDate(l.Date))
      .filter((d) => d !== "-");
    const maxTimeEntry =
      timeEntryDates.length > 0
        ? timeEntryDates.reduce((a, b) => (a > b ? a : b))
        : undefined;
    const stateDate = original.item.lastStateChangeDate;
    const lastActivityDate =
      maxTimeEntry && stateDate
        ? maxTimeEntry > stateDate
          ? maxTimeEntry
          : stateDate
        : (maxTimeEntry ?? stateDate);

    kbMap.set(result.id, {
      id: original.item.id,
      entityType: original.item.entityType,
      projectName: original.item.projectName,
      name: original.item.name,
      summary: result.summary ?? "",
      tags: result.tags ?? [],
      userActivities: result.userActivities ?? {},
      stakeholders: (result.stakeholders || result.stakeholder) ?? [],
      cachedAt: getISOTimestamp(),
      createDate: original.item.createDate,
      currentState: original.item.stateName,
      isFinalState: original.item.isFinalState,
      lastStateChangeDate: stateDate,
      lastActivityDate,
    });
    batchIds.delete(result.id);
  }

  if (batchIds.size > 0) {
    logger.warn(
      `applyResults: ${batchIds.size} item senza risposta AI — IDs: ${[...batchIds].join(", ")}`,
    );
  }
}

// ─── Claude provider ──────────────────────────────────────────────────────────
class ClaudeKbProvider extends BatchKbProvider {
  readonly name = "claude";

  constructor() {
    super(Number.parseInt(process.env["CLAUDE_MODEL_MAX_TPM"] ?? "200000"));
  }

  isAvailable(): boolean {
    return !!process.env["CLAUDE_API_KEY"];
  }

  protected async processBatch(
    batch: EnrichedItem[],
    kbMap: Map<number, KbEntry>,
    batchNum: number,
  ): Promise<void> {
    const client = new Anthropic({ apiKey: process.env["CLAUDE_API_KEY"]! });
    const modelName = (
      process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001"
    )
      .replaceAll(/['"]/g, "")
      .trim();
    const context = `kb-batch-${batchNum}`;

    const prompt = AnalysisPrompts.getBatchAnalysisPrompt(batch);
    logger.info(
      `Batch Claude ${batch.length} item (~${Math.ceil(prompt.length / 4)} token)...`,
    );

    const message = await client.messages.create({
      model: modelName,
      max_tokens: 4000,
      messages: [{ role: "user", content: prompt }],
    });

    const block = message.content[0];
    const raw = block.type === "text" ? block.text.trim() : "{}";
    const stopReason = message.stop_reason ?? undefined;

    logger.debug(
      `Usage: ${message.usage.input_tokens} in / ${message.usage.output_tokens} out — stop: ${stopReason}`,
    );
    if (stopReason === "max_tokens") {
      logger.warn(
        `Batch Claude ${batchNum}: risposta troncata (max_tokens) — JSON probabilmente incompleto`,
      );
    }

    // Persist raw before parsing
    const rawPath = await saveRawResponse({
      provider: "claude",
      model: modelName,
      context,
      stopReason,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      parsedOk: false,
      raw,
    });
    logger.debug(`Raw response salvata: ${rawPath}`);

    const data = extractJson(raw);
    void saveRawResponse({
      provider: "claude",
      model: modelName,
      context,
      stopReason,
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      parsedOk: true,
      raw,
    });

    applyResults(batch, data, kbMap);
    await saveKb(Array.from(kbMap.values()));
    logger.info(`Batch Claude ${batchNum} salvato (${batch.length} item).`);
  }
}

// ─── Gemini provider ──────────────────────────────────────────────────────────
class GeminiKbProvider extends BatchKbProvider {
  readonly name = "gemini";

  constructor() {
    super(Number.parseInt(process.env["GEMINI_MODEL_MAX_TPM"] ?? "1000000"));
  }

  isAvailable(): boolean {
    return !!process.env["GEMINI_API_KEY"];
  }

  protected async processBatch(
    batch: EnrichedItem[],
    kbMap: Map<number, KbEntry>,
    batchNum: number,
  ): Promise<void> {
    const genAI = new GoogleGenAI({ apiKey: process.env["GEMINI_API_KEY"]! });
    const modelName = (process.env["GEMINI_MODEL"] ?? "gemini-2.0-flash")
      .replaceAll(/['"]/g, "")
      .trim();
    const context = `kb-batch-${batchNum}`;

    const prompt = AnalysisPrompts.getBatchAnalysisPrompt(batch);
    logger.info(
      `Batch Gemini ${batch.length} item (~${Math.ceil(prompt.length / 4)} token)...`,
    );

    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" },
    });

    const usage = response.usageMetadata;
    const inputTokens = usage?.promptTokenCount;
    const outputTokens = usage?.candidatesTokenCount;
    const candidate = response.candidates?.[0];
    const finishReason = candidate?.finishReason;

    logger.debug(
      `Usage: ${inputTokens ?? "?"} in / ${outputTokens ?? "?"} out — finish: ${finishReason ?? "unknown"}`,
    );

    if (!candidate) {
      throw new Error(
        `Gemini batch ${batchNum}: nessun candidato — possibile blocco safety`,
      );
    }
    if (finishReason && finishReason !== "STOP") {
      logger.warn(
        `Batch Gemini ${batchNum}: finishReason=${finishReason} — risposta potenzialmente incompleta`,
      );
    }

    const raw = candidate.content?.parts?.[0]?.text ?? "";
    if (!raw) {
      throw new Error(
        `Gemini batch ${batchNum}: testo vuoto (finishReason=${finishReason ?? "unknown"})`,
      );
    }

    // Persist raw before parsing
    const rawPath = await saveRawResponse({
      provider: "gemini",
      model: modelName,
      context,
      stopReason: finishReason ?? undefined,
      inputTokens,
      outputTokens,
      parsedOk: false,
      raw,
    });
    logger.debug(`Raw response salvata: ${rawPath}`);

    const data = extractJson(raw);
    void saveRawResponse({
      provider: "gemini",
      model: modelName,
      context,
      stopReason: finishReason ?? undefined,
      inputTokens,
      outputTokens,
      parsedOk: true,
      raw,
    });

    applyResults(batch, data, kbMap);
    await saveKb(Array.from(kbMap.values()));
    logger.info(`Batch Gemini ${batchNum} salvato (${batch.length} item).`);
  }
}

// ─── Replay provider ─────────────────────────────────────────────────────────
/**
 * Offline replay: reads a previously saved raw AI response file and re-runs the
 * ETL (extractJson → applyResults → saveKb) without any network calls.
 *
 * Combine with --from-enriched to get a fully offline run:
 *   tsx src/targetprocess/collector.ts --update-kb \
 *     --from-enriched=data/raw/targetprocess/enriched-2026-03-23.json \
 *     --from-ai-response=data/raw/ai-responses/2026-03-23_175054_gemini_kb-batch-1.json
 */
class ReplayProvider implements KbCollectorProvider {
  readonly name = "replay";
  private readonly filePath: string;

  constructor(filePath: string) {
    this.filePath = filePath;
  }

  isAvailable(): boolean {
    return true;
  }

  async collect(
    items: EnrichedItem[],
    kbMap: Map<number, KbEntry>,
  ): Promise<void> {
    const raw = await fs.readFile(this.filePath, "utf-8");
    const record = JSON.parse(raw) as import("../aiRaw").RawResponseRecord;

    logger.info(`Replay da: ${this.filePath}`);
    logger.info(`  Provider originale : ${record.provider}`);
    logger.info(`  Model              : ${record.model}`);
    logger.info(`  Context            : ${record.context}`);
    logger.info(`  Salvato il         : ${record.savedAt}`);
    logger.info(
      `  Token              : ${record.inputTokens ?? "?"} in / ${record.outputTokens ?? "?"} out`,
    );
    logger.info(`  Stop/finish reason : ${record.stopReason ?? "—"}`);
    logger.info(`  Parsed ok (orig.)  : ${record.parsedOk}`);

    const data = extractJson(record.raw);
    applyResults(items, data, kbMap);
    await saveKb(Array.from(kbMap.values()));
    logger.info(`Replay completato: ${kbMap.size} entries in KB.`);
  }
}

// ─── Provider chain ───────────────────────────────────────────────────────────
function buildProviders(forceProvider?: string): KbCollectorProvider[] {
  const all: Record<string, KbCollectorProvider> = {
    claude: new ClaudeKbProvider(),
    gemini: new GeminiKbProvider(),
  };

  if (forceProvider) {
    const p = all[forceProvider];
    if (!p)
      throw new Error(
        `Provider sconosciuto: ${forceProvider}. Valori validi: claude, gemini`,
      );
    return [p];
  }

  return [all["claude"], all["gemini"]];
}

// ─── CLI helpers ──────────────────────────────────────────────────────────────
interface RunArgs {
  updateKb: boolean;
  force: boolean;
  providerArg?: string;
  fromEnriched?: string;
  fromAiResponse?: string;
}

function parseRunArgs(): RunArgs {
  const argv = process.argv;
  const findArg = (prefix: string) =>
    argv
      .find((a) => a.startsWith(prefix))
      ?.split("=")
      .slice(1)
      .join("=");

  return {
    updateKb: argv.includes("--update-kb"),
    force: argv.includes("--force"),
    providerArg: findArg("--provider="),
    fromEnriched: findArg("--from-enriched="),
    fromAiResponse: findArg("--from-ai-response="),
  };
}

async function runEnrichmentFromApi(
  client: TargetprocessClient,
  kbMap: Map<number, KbEntry>,
  force: boolean,
): Promise<EnrichedItem[]> {
  logger.info("Recupero item assegnati da TargetProcess...");
  const me = await client.getMe();
  const items = await client.getMyAssignedOpenItems();
  logger.info(`Trovati ${items.length} open item.`);

  const toProcess = items.filter(
    (item) =>
      force || !kbMap.has(item.id) || kbMap.get(item.id)!.name !== item.name,
  );

  if (toProcess.length === 0) {
    logger.info("Nessun item da aggiornare.");
    return [];
  }

  // Phase A — cheap pre-filter before HTTP calls
  const myNameNorm = nameSet([me.FullName]);
  const isRelevantByMeta = (item: TpOpenItem): boolean =>
    nameSetHas(myNameNorm, item.owner) ||
    nameSetHas(COLLEAGUES_PRIORITY, item.owner) ||
    item.assignments.some(
      (a) =>
        nameSetHas(myNameNorm, a.fullName) ||
        nameSetHas(COLLEAGUES_PRIORITY, a.fullName),
    );

  const preFiltered = toProcess.filter(isRelevantByMeta);
  if (preFiltered.length < toProcess.length) {
    logger.info(
      `Pre-filtro: scartati ${toProcess.length - preFiltered.length} item senza coinvolgimento del team`,
    );
  }

  logger.info(`Arricchimento ${preFiltered.length} item (stats + log)...`);
  const enriched: EnrichedItem[] = [];

  for (const item of preFiltered) {
    const stats = await client.getAssignableStatistics(item.id);
    const logs = await client.getTimesByAssignable(item.id);

    const hasMyHours = stats.some(
      (s) => nameSetHas(myNameNorm, s.userName) && s.totalHours > 0,
    );
    const hasColleagueHours = stats.some(
      (s) => nameSetHas(COLLEAGUES_PRIORITY, s.userName) && s.totalHours > 0,
    );
    const hasColleagueAssigned = item.assignments.some((a: TpAssignmentEntry) =>
      nameSetHas(COLLEAGUES_PRIORITY, a.fullName),
    );
    const ownerIsRelevant =
      nameSetHas(myNameNorm, item.owner) ||
      nameSetHas(COLLEAGUES_PRIORITY, item.owner);

    // Phase B — post-filter: discard if no actual team involvement
    if (
      !hasMyHours &&
      !hasColleagueHours &&
      !hasColleagueAssigned &&
      !ownerIsRelevant
    ) {
      logger.debug(
        `Post-filtro: scartato item #${item.id} "${item.name}" — nessun coinvolgimento del team`,
      );
      continue;
    }

    enriched.push({
      item,
      stats,
      logs,
      priority: hasMyHours
        ? 4
        : hasColleagueHours
          ? 3
          : hasColleagueAssigned
            ? 2
            : 1,
    });
  }

  // High-priority first (my hours > colleague hours > colleague assigned > rest), then by ID desc
  enriched.sort((a, b) =>
    b.priority !== a.priority ? b.priority - a.priority : b.item.id - a.item.id,
  );

  const enrichedPath = await saveEnriched(enriched, me.Id, me.FullName);
  logger.info(`Enriched salvato: ${enrichedPath}`);
  return enriched;
}

async function runProviderPhase(
  enriched: EnrichedItem[],
  kbMap: Map<number, KbEntry>,
  providers: KbCollectorProvider[],
): Promise<void> {
  logger.info(`Provider chain: ${providers.map((p) => p.name).join(" → ")}`);

  for (const provider of providers) {
    if (!provider.isAvailable()) {
      logger.warn(`[${provider.name}] non disponibile, skip`);
      continue;
    }
    try {
      logger.info(`[${provider.name}] avvio raccolta...`);
      await provider.collect(enriched, kbMap);
      await saveKb(Array.from(kbMap.values()));
      logger.info(`KB aggiornata: ${kbMap.size} entries totali → ${KB_FILE}`);
      return;
    } catch (err) {
      logger.error(`[${provider.name}] errore: ${(err as Error).message}`);
    }
  }

  throw new Error("Tutti i provider hanno fallito.");
}

// ─── CLI entry point ──────────────────────────────────────────────────────────
async function run(): Promise<void> {
  const args = parseRunArgs();

  if (!args.updateKb) {
    logger.info(
      "Usage: tsx src/targetprocess/collector.ts --update-kb [--force] [--provider=claude|gemini]",
    );
    logger.info(
      "       tsx src/targetprocess/collector.ts --update-kb --from-enriched=<path> [--from-ai-response=<path>]",
    );
    process.exit(0);
  }

  const kb = await loadKb();
  const kbMap = new Map<number, KbEntry>(kb.items.map((e) => [e.id, e]));

  // ── Enrichment phase ─────────────────────────────────────────────────────
  let enriched: EnrichedItem[];

  // Auto-detect today's enriched file when --from-enriched is not explicit and --force is not set
  const todayEnrichedPath = path.join(
    ENRICHED_DIR,
    `enriched-${dateToString()}.json`,
  );
  const enrichedSource =
    args.fromEnriched ??
    (!args.force &&
    (await fs
      .access(todayEnrichedPath)
      .then(() => true)
      .catch(() => false))
      ? todayEnrichedPath
      : undefined);

  if (enrichedSource) {
    logger.info(`Carico enriched da file: ${enrichedSource}`);
    const loaded = await loadEnriched(enrichedSource);
    enriched = loaded.items;
    logger.info(
      `Caricati ${enriched.length} item (userId=${loaded.userId}, user=${loaded.userName}).`,
    );
  } else {
    enriched = await runEnrichmentFromApi(
      new TargetprocessClient(),
      kbMap,
      args.force,
    );
    if (enriched.length === 0) return;
  }

  // ── Provider phase ────────────────────────────────────────────────────────
  const providers = args.fromAiResponse
    ? [new ReplayProvider(args.fromAiResponse)]
    : buildProviders(args.providerArg);

  await runProviderPhase(enriched, kbMap, providers);
}

run().catch((err: Error) => {
  logger.error(err.message);
  process.exit(1);
});
