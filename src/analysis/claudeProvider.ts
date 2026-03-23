/**
 * Claude analyzer providers: Anthropic API, OpenAI-compatible, and CLI.
 */
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalyzerProvider, ProposalEntry } from "./analyzer";
import { BatchAnalyzerProvider, stripCodeFence } from "./analyzer";
import { createLogger } from "../logger";
import { saveRawResponse } from "../aiRaw";

const log = createLogger("claude");

/** Calls the local `claude` CLI (Claude Code subscription) in non-interactive mode. */
function callClaudeCli(
    systemPrompt: string,
    userPrompt:   string,
    model:        string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        // Remove CLAUDECODE so the subprocess can run outside an active session
        const env = { ...process.env };
        delete env["CLAUDECODE"];

        const proc = spawn("claude", ["-p", "--model", model], {
            env,
            stdio: ["pipe", "pipe", "pipe"],
        });

        const chunks: Buffer[] = [];
        proc.stdin.write(`${systemPrompt}\n\n${userPrompt}`);
        proc.stdin.end();

        proc.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
        proc.stderr.on("data", (chunk: Buffer) => process.stderr.write(chunk));
        proc.on("close", (code) => {
            if (code !== 0) reject(new Error(`claude CLI exited with code ${code}`));
            else resolve(Buffer.concat(chunks).toString("utf-8").trim());
        });
        proc.on("error", (err) => {
            if ((err as NodeJS.ErrnoException).code === "ENOENT") {
                reject(new Error("claude CLI non trovato — installa Claude Code o disabilita il provider CLI"));
            } else {
                reject(err);
            }
        });
    });
}

/**
 * Calls an OpenAI-compatible API (Ollama, LM Studio, OpenRouter, etc.).
 * Requires OPENAI_BASE_URL and optionally OPENAI_API_KEY.
 */
async function callOpenAiCompatible(
    systemPrompt: string,
    userPrompt:   string,
    model:        string,
): Promise<string> {
    const baseUrl = process.env["OPENAI_BASE_URL"]!;
    const apiKey  = process.env["OPENAI_API_KEY"] ?? "ollama";

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type":  "application/json",
            "Authorization": `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user",   content: userPrompt },
            ],
            max_tokens: 4096,
        }),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI-compatible API error ${response.status}: ${text}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (await response.json()) as any;
    return (data.choices?.[0]?.message?.content ?? "") as string;
}

/** Claude via Anthropic API (direct SDK). */
export class ClaudeApiProvider implements AnalyzerProvider {
    readonly name: string = "claude:anthropic-api";

    isAvailable(): boolean {
        return !!process.env["CLAUDE_API_KEY"];
    }

    async analyze(systemPrompt: string, userPrompt: string, context = "analysis"): Promise<ProposalEntry[]> {
        const model = process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001";
        const anthropic = new Anthropic({ apiKey: process.env["CLAUDE_API_KEY"] });

        log.info(`[${this.name}] Invio richiesta a Anthropic (${model})...`);
        const message = await anthropic.messages.create({
            model,
            max_tokens: 1024 * 8, // More tokens
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
        });

        const block = message.content[0];
        if (block.type !== "text") throw new Error("Risposta Claude non testuale");

        const responseText = block.text;
        const stopReason = message.stop_reason ?? undefined;
        const inputTokens = message.usage.input_tokens;
        const outputTokens = message.usage.output_tokens;

        log.debug(`Usage: ${inputTokens} in / ${outputTokens} out — stop: ${stopReason}`);

        // Persist raw response
        await saveRawResponse({
            provider: this.name,
            model,
            context,
            stopReason,
            inputTokens,
            outputTokens,
            parsedOk: true,
            raw: responseText,
        });

        return JSON.parse(stripCodeFence(responseText)) as ProposalEntry[];
    }
}

/** OpenAI-compatible local model (Ollama, LM Studio, etc). */
export class OpenAiCompatibleProvider extends BatchAnalyzerProvider {
    readonly name: string = "openai-compat";

    isAvailable(): boolean {
        return !!process.env["OPENAI_BASE_URL"];
    }

    async analyzeBatch(systemPrompt: string, userPromptBatched: string): Promise<{date: string, entries: ProposalEntry[]}[]> {
        const model = process.env["OPENAI_MODEL"] ?? "qwen2.5-coder:3b";
        log.info(`[${this.name}] Invio batch a endpoint OpenAI-compat (${model})...`);
        const responseText = await callOpenAiCompatible(systemPrompt, userPromptBatched, model);
        
        await saveRawResponse({
            provider: this.name,
            model,
            context: "batch-analysis",
            parsedOk: true,
            raw: responseText,
        });
        
        return JSON.parse(stripCodeFence(responseText)) as {date: string, entries: ProposalEntry[]}[];
    }
}

/** Claude via local CLI (uses Claude Code subscription). */
export class ClaudeCliProvider implements AnalyzerProvider {
    readonly name = "claude:cli";

    isAvailable(): boolean {
        return true;
    }

    async analyze(systemPrompt: string, userPrompt: string, context = "analysis-cli"): Promise<ProposalEntry[]> {
        const model        = process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001";
        const responseText = await callClaudeCli(systemPrompt, userPrompt, model);

        const rawPath = await saveRawResponse({
            provider: this.name,
            model,
            context,
            parsedOk: false,
            raw:      responseText,
        });
        log.debug(`Raw response salvata: ${rawPath}`);

        const parsed = JSON.parse(stripCodeFence(responseText)) as ProposalEntry[];
        void saveRawResponse({ provider: this.name, model, context, parsedOk: true, raw: responseText });

        return parsed;
    }
}
