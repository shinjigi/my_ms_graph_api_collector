/**
 * Claude analyzer provider — Anthropic API (direct SDK).
 */
import Anthropic from "@anthropic-ai/sdk";
import { AnalyzerProvider, stripCodeFence, tpmToChars } from "./base";
import { createLogger } from "../logger";
import { saveRawResponse } from "../aiRaw";
import { ProposalEntry } from "@shared/analysis";

const log = createLogger("claude");

export class ClaudeApiProvider implements AnalyzerProvider {
    readonly name = "claude:anthropic-api";

    get maxInputChars(): number {
        return tpmToChars("CLAUDE_MODEL_MAX_TPM", 200000);
    }

    async isAvailable(): Promise<boolean> {
        if (!process.env["CLAUDE_API_KEY"]) {
            log.debug(`[${this.name}] CLAUDE_API_KEY non impostata`);
            return false;
        }
        try {
            const anthropic = new Anthropic({ apiKey: process.env["CLAUDE_API_KEY"] });
            log.debug(`[${this.name}] probe in corso (models.list)...`);
            await anthropic.models.list({ limit: 1 });
            log.info(`[${this.name}] API disponibile`);
            return true;
        } catch (err) {
            const msg = (err as Error).message;
            if (msg.includes("credit balance")) {
                log.warn(`[${this.name}] credito Anthropic esaurito`);
            } else if (msg.includes("401") || msg.includes("auth")) {
                log.warn(`[${this.name}] API key non valida`);
            } else {
                log.warn(`[${this.name}] non disponibile: ${msg}`);
            }
            return false;
        }
    }

    async analyzeBatch(
        systemPrompt: string,
        userPromptBatched: string,
        context = "analysis",
    ): Promise<{ date: string; entries: ProposalEntry[] }[]> {
        const model     = process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001";
        const anthropic = new Anthropic({ apiKey: process.env["CLAUDE_API_KEY"] });

        const promptChars = systemPrompt.length + userPromptBatched.length;
        log.info(`[${this.name}] Invio batch a Anthropic (${model}) — prompt ~${promptChars} chars...`);

        const message = await anthropic.messages.create({
            model,
            max_tokens: 1024 * 8,
            system:     systemPrompt,
            messages:   [{ role: "user", content: userPromptBatched }],
        });

        const block = message.content[0];
        if (block.type !== "text") throw new Error("Risposta Claude non testuale");

        const responseText = block.text;
        const stopReason   = message.stop_reason ?? undefined;
        const inputTokens  = message.usage.input_tokens;
        const outputTokens = message.usage.output_tokens;

        log.info(`[${this.name}] Completato — ${inputTokens} token in / ${outputTokens} token out — stop: ${stopReason}`);
        if (stopReason === "max_tokens") {
            log.warn(`[${this.name}] Risposta troncata (max_tokens raggiunto) — considera un batch più piccolo`);
        }

        await saveRawResponse({
            provider:     this.name,
            model,
            context,
            stopReason,
            inputTokens,
            outputTokens,
            parsedOk:     true,
            raw:          responseText,
        });

        return JSON.parse(stripCodeFence(responseText)) as { date: string; entries: ProposalEntry[] }[];
    }
}
