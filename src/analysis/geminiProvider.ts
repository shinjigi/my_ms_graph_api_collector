/**
 * Gemini analyzer provider using the @google/genai SDK.
 */
import { GoogleGenAI } from "@google/genai";
import type { AnalyzerProvider, ProposalEntry } from "./analyzer";

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
    readonly name: string;
    private readonly modelName: string;

    constructor() {
        this.modelName = process.env["GEMINI_MODEL"] ?? "gemini-2.0-flash";
        this.name = `gemini:${this.modelName}`;
    }

    isAvailable(): boolean {
        return !!process.env["GEMINI_API_KEY"];
    }

    async analyze(systemPrompt: string, userPrompt: string): Promise<ProposalEntry[]> {
        const apiKey = process.env["GEMINI_API_KEY"]!;
        const genAI  = new GoogleGenAI({ apiKey });

        const response = await genAI.models.generateContent({
            model:    this.modelName,
            contents: [
                { role: "user", parts: [{ text: systemPrompt }] },
                { role: "user", parts: [{ text: userPrompt }] },
            ],
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            config: {
                responseMimeType: "application/json",
                responseSchema,
            } as any,
        });

        const text = response.candidates?.[0]?.content?.parts?.[0]?.text ?? "[]";
        return JSON.parse(text) as ProposalEntry[];
    }
}
