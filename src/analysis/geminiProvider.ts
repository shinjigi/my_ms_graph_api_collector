/**
 * Gemini analyzer provider using the @google/genai SDK.
 */
import { GoogleGenAI, Type, Schema } from "@google/genai";
import type { ProposalEntry } from "./analyzer";
import { BatchAnalyzerProvider } from "./analyzer";
import { createLogger }   from "../logger";
import { saveRawResponse } from "../aiRaw";

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
                }
            }
        },
        required: ["date", "entries"],
    },
};

export class GeminiProvider extends BatchAnalyzerProvider {
    readonly name: string;
    private readonly modelName: string;

    constructor() {
        super();
        this.modelName = process.env["GEMINI_MODEL"] || "gemini-2.0-flash";
        this.name = `gemini:${this.modelName}`;
    }

    isAvailable(): boolean {
        return !!process.env["GEMINI_API_KEY"];
    }

    async analyzeBatch(systemPrompt: string, userPromptBatched: string): Promise<{date: string, entries: ProposalEntry[]}[]> {
        const apiKey = process.env["GEMINI_API_KEY"]!;
        const ai = new GoogleGenAI({ apiKey });

        log.info(`[${this.name}] Invio richiesta batch (schema guidato) a Gemini...`);
        const response = await ai.models.generateContent({
            model: this.modelName,
            contents: [
                { role: 'user', parts: [{ text: systemPrompt + '\n\n' + userPromptBatched }] }
            ],
            config: {
                responseMimeType: "application/json",
                responseSchema: schema,
            }
        });

        if (!response.text) throw new Error("Risposta vuota da Gemini");
        const raw = response.text;

        await saveRawResponse({
            provider: this.name,
            model: this.modelName,
            context: "batch-analysis",
            parsedOk: true,
            raw,
        });

        return JSON.parse(raw) as {date: string, entries: ProposalEntry[]}[];
    }
}
