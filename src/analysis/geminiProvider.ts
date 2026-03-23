/**
 * Gemini analyzer provider using the @google/genai SDK.
 */
import { GoogleGenAI }  from "@google/genai";
import type { AnalyzerProvider, ProposalEntry } from "./analyzer";
import { createLogger }   from "../logger";
import { saveRawResponse } from "../aiRaw";

const log = createLogger("gemini");

/** Structured output schema for Gemini (new SDK — plain string types). */
const responseSchema = {
    type: "array",
    items: {
        type: "object",
        properties: {
            taskId:        { type: "number",  nullable: true },
            entityType:    { type: "string",  enum: ["UserStory", "Task", "Bug", "recurring"] },
            taskName:      { type: "string" },
            inferredHours: { type: "number" },
            confidence:    { type: "string",  enum: ["high", "medium", "low"] },
            reasoning:     { type: "string" },
            approved:      { type: "boolean" },
        },
        required: ["entityType", "taskName", "inferredHours", "confidence", "reasoning", "approved"],
    },
} as const;

export class GeminiProvider implements AnalyzerProvider {
    readonly name:            string;
    private readonly modelName: string;

    constructor() {
        this.modelName = process.env["GEMINI_MODEL"] ?? "gemini-2.0-flash";
        this.name      = `gemini:${this.modelName}`;
    }

    isAvailable(): boolean {
        return !!process.env["GEMINI_API_KEY"];
    }

    async analyze(systemPrompt: string, userPrompt: string, context = "analysis"): Promise<ProposalEntry[]> {
        const apiKey = process.env["GEMINI_API_KEY"]!;
        const genAI  = new GoogleGenAI({ apiKey });

        const response = await genAI.models.generateContent({
            model:    this.modelName,
            contents: [
                { role: "user", parts: [{ text: systemPrompt }] },
                { role: "user", parts: [{ text: userPrompt }] },
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: { responseMimeType: "application/json", responseSchema } as any,
        });

        // Usage metadata
        const usage       = response.usageMetadata;
        const inputTokens  = usage?.promptTokenCount;
        const outputTokens = usage?.candidatesTokenCount;
        log.debug(`Usage: ${inputTokens ?? "?"} in / ${outputTokens ?? "?"} out`);

        // Candidate safety / finish reason
        const candidate    = response.candidates?.[0];
        const finishReason = candidate?.finishReason;

        if (!candidate) {
            throw new Error("Gemini: nessun candidato nella risposta — possibile blocco safety o errore interno");
        }
        if (finishReason && finishReason !== "STOP") {
            log.warn(`Gemini finishReason=${finishReason} — risposta potenzialmente incompleta`);
        }

        const raw = candidate.content?.parts?.[0]?.text ?? "";

        if (!raw) {
            throw new Error(`Gemini: testo vuoto nella risposta (finishReason=${finishReason ?? "unknown"})`);
        }

        // Persist raw response before any parsing
        const rawPath = await saveRawResponse({
            provider:     this.name,
            model:        this.modelName,
            context,
            stopReason:   finishReason ?? undefined,
            inputTokens,
            outputTokens,
            parsedOk:     false,
            raw,
        });
        log.debug(`Raw response salvata: ${rawPath}`);

        const parsed = JSON.parse(raw) as ProposalEntry[];
        void saveRawResponse({ provider: this.name, model: this.modelName, context, stopReason: finishReason ?? undefined, inputTokens, outputTokens, parsedOk: true, raw });

        return parsed;
    }
}
