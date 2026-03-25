/**
 * Base types and utilities shared by analyzer.ts and all provider implementations.
 * Kept in a separate file to avoid circular imports between analyzer.ts and the providers.
 */
import type { ProposalEntry } from "@shared/analysis";

export interface AnalyzerProvider {
  readonly name: string;
  isAvailable(): boolean;
  /** context: human-readable label for the raw-response file (e.g. "analysis-2026-03-23"). */
  analyze(
    systemPrompt: string,
    userPrompt: string,
    context?: string,
  ): Promise<ProposalEntry[]>;
}

export abstract class BatchAnalyzerProvider implements AnalyzerProvider {
  abstract readonly name: string;
  abstract isAvailable(): boolean;

  async analyze(
    _systemPrompt: string,
    _userPrompt: string,
  ): Promise<ProposalEntry[]> {
    throw new Error(
      "BatchAnalyzerProvider cannot be called via simple analyze()",
    );
  }

  abstract analyzeBatch(
    systemPrompt: string,
    userPromptBatched: string,
  ): Promise<{ date: string; entries: ProposalEntry[] }[]>;
}

export function stripCodeFence(text: string): string {
  return text
    .replaceAll(/^```(?:json)?\s*/m, "")
    .replaceAll(/\s*```\s*$/m, "")
    .trim();
}
