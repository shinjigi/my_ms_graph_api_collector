/**
 * Base types and utilities shared by analyzer.ts and all provider implementations.
 * Kept in a separate file to avoid circular imports between analyzer.ts and the providers.
 */
import type { ProposalEntry } from "@shared/analysis";

export interface AnalyzerProvider {
    readonly name: string;
    /**
     * Max prompt size in characters for a single API call.
     * Computed from the corresponding *_MODEL_MAX_TPM env var (tokens × 4 chars/token).
     * Used by the batch-building loop in analyzer.ts to size prompts correctly.
     */
    readonly maxInputChars: number;
    /**
     * Returns true if the provider is configured AND reachable.
     * Performs a lightweight probe call (model list or minimal inference)
     * to confirm the service is up and the credentials are valid.
     */
    isAvailable(): Promise<boolean>;
    /**
     * Analyze a batched prompt (one or more days) and return per-day results.
     * userPromptBatched is the JSON payload built by buildUserPromptBatched().
     */
    analyzeBatch(
        systemPrompt: string,
        userPromptBatched: string,
    ): Promise<{ date: string; entries: ProposalEntry[] }[]>;
}

/** Strips markdown code fences from a raw AI response before JSON.parse(). */
export function stripCodeFence(text: string): string {
    // replaceAll requires the global flag when used with a RegExp
    return text
        .replaceAll(/^```(?:json)?\s*/gm, "")
        .replaceAll(/\s*```\s*$/gm, "")
        .trim();
}

/**
 * Strips JS-style line and block comments from a JSON string.
 * Some local models (e.g. qwen2.5-coder) emit // comments inside JSON output.
 */
export function stripJsonComments(json: string): string {
    return json
        .replace(/\/\/[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();
}

/** Converts a TPM (tokens-per-minute / max-context-tokens) env value to a character budget. */
export function tpmToChars(envKey: string, defaultTokens: number): number {
    return Number(process.env[envKey] ?? defaultTokens) * 4;
}
