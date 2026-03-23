/**
 * Gemini analyzer provider using Google Generative AI SDK.
 */
import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import type { ResponseSchema } from "@google/generative-ai";
import type { AnalyzerProvider, ProposalEntry } from "./analyzer";

/** Structured output schema for Gemini. */
const schema = {
    description: "List of time allocation entries",
    type: SchemaType.ARRAY,
    items: {
        type: SchemaType.OBJECT,
        properties: {
            taskId: { type: SchemaType.NUMBER, nullable: true },
            entityType: {
                type: SchemaType.STRING,
                enum: ["UserStory", "Task", "Bug", "recurring"],
            },
            taskName: { type: SchemaType.STRING },
            inferredHours: { type: SchemaType.NUMBER },
            confidence: { type: SchemaType.STRING, enum: ["high", "medium", "low"] },
            reasoning: { type: SchemaType.STRING },
            approved: { type: SchemaType.BOOLEAN },
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
} as const;

export class GeminiProvider implements AnalyzerProvider {
    readonly name: string;
    private readonly modelName: string;

    constructor() {
        this.modelName = process.env["GEMINI_MODEL"] || "gemini-2.0-flash";
        this.name = `gemini:${this.modelName}`;
    }

    isAvailable(): boolean {
        return !!process.env["GEMINI_API_KEY"];
    }

    async analyze(systemPrompt: string, userPrompt: string): Promise<ProposalEntry[]> {
        const apiKey = process.env["GEMINI_API_KEY"]!;
        const genAI = new GoogleGenerativeAI(apiKey);

        const model = genAI.getGenerativeModel({
            model: this.modelName,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: schema as unknown as ResponseSchema,
            },
        });

        const result = await model.generateContent([systemPrompt, userPrompt]);
        const text = result.response.text();
        return JSON.parse(text) as ProposalEntry[];
    }
}
