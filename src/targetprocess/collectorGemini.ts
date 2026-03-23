/**
 * TargetProcess Knowledge Base collector (Versione Batching & Sorting).
 * * Usage: npx tsx src/targetprocess/geminiCollector.ts --update-kb
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

import { TargetprocessClient } from "./client";
import { AnalysisPrompts } from "./prompts";
import type { TpOpenItem, TpUserStat, TpTimeEntry } from "./types";

const KB_DIR = path.join(process.cwd(), "data", "kb");
const KB_FILE = path.join(KB_DIR, "us-summaries.json");

// Configurazioni dai limiti API
const MAX_TPM = Number.parseInt(process.env.GEMINI_MODEL_MAX_TPM || "1000000");
const TPM_THRESHOLD = 0.8; // Utilizziamo l'80% del limite

// Colleghi con priorità di ordinamento
const COLLEAGUES_PRIORITY = new Set([
  "Flavio Passera",
  "Marco Anselmo",
  "Michela Della Misericordia",
  "Susanna Castelletti",
  "Nicola Achille",
  "Chiara Bonasi",
  "Sara Fiano",
  "Marcella Nardone",
  "Matteo D'Amario",
]);

interface KbEntry {
  id: number;
  entityType: string;
  name: string;
  summary: string;
  tags: string[];
  userActivities: Record<string, string>; // Riassunti per utente
  cachedAt: string;
}

interface KbStore {
  updatedAt: string;
  items: KbEntry[];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

async function loadKb(): Promise<KbStore> {
  try {
    const raw = await fs.readFile(KB_FILE, "utf-8");
    return JSON.parse(raw) as KbStore;
  } catch {
    return { updatedAt: "", items: [] };
  }
}

async function saveKb(items: KbEntry[]): Promise<void> {
  const store: KbStore = { updatedAt: new Date().toISOString(), items };
  await fs.writeFile(KB_FILE, JSON.stringify(store, null, 2), "utf-8");
}

/**
 * Esegue l'analisi di un batch di item
 */
async function processBatch(
  batch: Array<{ item: TpOpenItem; stats: TpUserStat[]; logs: TpTimeEntry[] }>,
  genAI: GoogleGenAI,
  kbMap: Map<number, KbEntry>,
): Promise<void> {
  const modelName = (process.env.GEMINI_MODEL || "gemini-1.5-flash")
    .replaceAll(/['"]/g, "")
    .trim();
  const prompt = AnalysisPrompts.getBatchAnalysisPrompt(batch);

  console.log(
    `    📡 Invio batch di ${batch.length} item (~${estimateTokens(prompt)} token)...`,
  );

  try {
    const response = await genAI.models.generateContent({
      model: modelName,
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: { responseMimeType: "application/json" } as any,
    });

    const text = response.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const data = JSON.parse(text.replaceAll(/```json|```/g, ""));

    for (const result of data.results || data || []) {
      const original = batch.find((b) => b.item.id === result.id);
      if (!original) continue;

      kbMap.set(result.id, {
        id: original.item.id,
        entityType: original.item.entityType,
        name: original.item.name,
        summary: result.summary,
        tags: result.tags,
        userActivities: result.userActivities || {},
        cachedAt: new Date().toISOString(),
      });
    }

    // Salvataggio immediato dopo il batch
    await saveKb(Array.from(kbMap.values()));
    console.log(`    ✅ Batch completato e salvato.`);
  } catch (error: any) {
    console.error(
      `    ❌ Errore durante l'elaborazione del batch:`,
      error.message,
    );
    throw error;
  }
}

async function run(): Promise<void> {
  const updateKb = process.argv.includes("--update-kb");
  const force = process.argv.includes("--force");

  if (!updateKb) {
    console.log(
      "Usage: npx tsx src/targetprocess/geminiCollector.ts --update-kb [--force]",
    );
    process.exit(0);
  }

  const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
  const clientTP = new TargetprocessClient();

  console.log("🔍 Recupero dati da TargetProcess...");
  const me = await clientTP.getMe();
  const items = await clientTP.getMyAssignedOpenItems();

  const kb = await loadKb();
  const kbMap = new Map<number, KbEntry>(kb.items.map((e) => [e.id, e]));

  console.log(`📦 Preparazione dati per ${items.length} item...`);

  const enrichedItems = [];
  for (const item of items) {
    // Saltiamo se non forzato e già presente
    if (!force && kbMap.has(item.id) && kbMap.get(item.id)?.name === item.name)
      continue;

    const stats = await clientTP.getAssignableStatistics(item.id);
    const logs = await clientTP.getTimesByAssignable(item.id);

    // Calcoliamo priorità per sorting
    const hasMyHours = stats.some(
      (s) => s.userName === me.FullName && s.totalHours > 0,
    );
    const hasColleagueHours = stats.some(
      (s) => COLLEAGUES_PRIORITY.has(s.userName) && s.totalHours > 0,
    );
    const hasColleagueAssigned =
      item.assignments?.some((a) => COLLEAGUES_PRIORITY.has(a)) || false;

    enrichedItems.push({
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

  // ORDINAMENTO RICHIESTO
  enrichedItems.sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return b.item.id - a.item.id; // Per ID desc
  });

  console.log(
    `🚀 Avvio batching su ${enrichedItems.length} item da analizzare...`,
  );

  let currentBatch: typeof enrichedItems = [];
  let currentBatchTokens = 0;

  for (let i = 0; i < enrichedItems.length; i++) {
    const entry = enrichedItems[i];
    const itemPromptPart = JSON.stringify(entry); // Approssimazione per batching
    const itemTokens = estimateTokens(itemPromptPart);

    // Se il prossimo item sfora l'80% del TPM, processiamo il batch attuale
    if (
      currentBatch.length > 0 &&
      currentBatchTokens + itemTokens > MAX_TPM * TPM_THRESHOLD
    ) {
      await processBatch(currentBatch, genAI, kbMap);
      await sleep(10000); // Pausa tra batch
      currentBatch = [];
      currentBatchTokens = 0;
    }

    currentBatch.push(entry);
    currentBatchTokens += itemTokens;

    // Se è l'ultimo, processiamo
    if (i === enrichedItems.length - 1) {
      await processBatch(currentBatch, genAI, kbMap);
    }
  }

  console.log(`\n✨ Fine processo. KB aggiornata con successo.`);
}

run().catch(console.error);
