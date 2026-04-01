/**
 * Gemini analyzer provider using the @google/genai SDK.
 */
import { GoogleGenAI, Type, Schema } from "@google/genai";
import { AnalyzerProvider, tpmToChars } from "./base";
import { createLogger } from "../logger";
import { saveRawResponse } from "./aiRaw";
import { ProposalEntry } from "@shared/analysis";

const log = createLogger("gemini");

/** Structured output schema for Gemini. */
const schema: Schema = {
  description: "List of day proposals",
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      date: { type: Type.STRING },
      entries: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            taskId: { type: Type.INTEGER, nullable: true },
            entityType: {
              type: Type.STRING,
              enum: ["UserStory", "Task", "Bug", "recurring"],
            },
            taskName: { type: Type.STRING },
            inferredHours: { type: Type.NUMBER },
            confidence: { type: Type.STRING, enum: ["high", "medium", "low"] },
            reasoning: { type: Type.STRING },
            approved: { type: Type.BOOLEAN },
          },
          required: [
            "entityType",
            "taskName",
            "inferredHours",
            "confidence",
            "reasoning",
            "approved",
          ],
        },
      },
    },
    required: ["date", "entries"],
  },
};

export class GeminiProvider implements AnalyzerProvider {
  readonly name: string;
  private readonly modelName: string;

  constructor() {
    this.modelName = process.env["GEMINI_MODEL"] ?? "gemini-2.0-flash";
    this.name = `gemini:${this.modelName}`;
  }

  get maxInputChars(): number {
    return tpmToChars("GEMINI_MODEL_MAX_TPM", 1000000);
  }

  async isAvailable(): Promise<boolean> {
    const apiKey = process.env["GEMINI_API_KEY"];
    if (!apiKey) {
      log.debug(`[${this.name}] GEMINI_API_KEY non impostata`);
      return false;
    }
    try {
      log.debug(`[${this.name}] probe in corso (models list)...`);
      const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}&pageSize=1`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      if (!res.ok) {
        const body = await res.text();
        if (res.status === 400 || res.status === 403) {
          log.warn(
            `[${this.name}] API key non valida o credito esaurito (HTTP ${res.status}): ${body.slice(0, 200)}`,
          );
        } else {
          log.warn(`[${this.name}] probe fallita HTTP ${res.status}`);
        }
        return false;
      }
      log.info(`[${this.name}] API disponibile`);
      return true;
    } catch (err) {
      log.warn(`[${this.name}] non raggiungibile: ${(err as Error).message}`);
      return false;
    }
  }

  async analyzeBatch(
    systemPrompt: string,
    userPromptBatched: string,
  ): Promise<{ date: string; entries: ProposalEntry[] }[]> {
    const apiKey = process.env["GEMINI_API_KEY"]!;
    const promptChars = systemPrompt.length + userPromptBatched.length;
    log.info(
      `[${this.name}] Invio batch a Gemini (${this.modelName}) — prompt ~${promptChars} chars...`,
    );

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: this.modelName,
      contents: [
        {
          role: "user",
          parts: [{ text: systemPrompt + "\n\n" + userPromptBatched }],
        },
      ],
      config: { responseMimeType: "application/json", responseSchema: schema },
    });

    if (!response.text) throw new Error("Risposta vuota da Gemini");
    const raw = response.text;

    log.info(`[${this.name}] Risposta ricevuta — ${raw.length} chars`);

    await saveRawResponse({
      provider: this.name,
      model: this.modelName,
      context: "batch-analysis",
      parsedOk: true,
      raw,
    });

    return JSON.parse(raw) as { date: string; entries: ProposalEntry[] }[];
  }
}
