/**
 * Claude analyzer providers: Anthropic API, OpenAI-compatible, and CLI.
 */
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import { AnalyzerProvider, stripCodeFence, stripJsonComments, tpmToChars } from "./base";
import { createLogger } from "../logger";
import { saveRawResponse } from "../aiRaw";
import { ProposalEntry } from "@shared/analysis";

const log = createLogger("claude");

/** Calls the local `claude` CLI (Claude Code subscription) in non-interactive mode. */
function callClaudeCli(
    systemPrompt: string,
    userPrompt: string,
    model: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
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
 * Calls an OpenAI-compatible API (Ollama, Open WebUI, LM Studio, OpenRouter, etc.).
 * Requires OPENAI_BASE_URL and optionally OPENAI_API_KEY.
 */
/**
 * Calls an OpenAI-compatible API using SSE streaming.
 * Streaming keeps the TCP connection alive during long CPU-bound inference,
 * preventing OS/router/proxy timeouts that would cut a silent long-running request.
 */
async function callOpenAiCompatible(
    systemPrompt: string,
    userPrompt: string,
    model: string,
): Promise<string> {
    const baseUrl   = process.env["OPENAI_BASE_URL"]!;
    const apiKey    = process.env["OPENAI_API_KEY"] ?? "ollama";
    const timeoutMs = Number(process.env["OPENAI_REQUEST_TIMEOUT_MS"] ?? 900_000);
    // num_ctx: override Ollama's default 4096-token context with the actual model window
    const numCtx    = Number(process.env["OPENAI_MODEL_MAX_TPM"] ?? 5000);

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method:  "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization:  `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user",   content: userPrompt   },
            ],
            max_tokens: 4096,
            stream:     true,  // SSE keeps TCP alive during long CPU inference
            options:    { num_ctx: numCtx },
        }),
        signal: AbortSignal.timeout(timeoutMs),
    });

    if (!response.ok) {
        const text = await response.text();
        throw new Error(`OpenAI-compatible API error ${response.status}: ${text}`);
    }
    if (!response.body) throw new Error("Risposta senza body (streaming non supportato?)");

    // Collect SSE stream: each line is "data: <json>" or "data: [DONE]"
    const reader  = response.body.getReader();
    const decoder = new TextDecoder();
    let fullContent = "";
    let tokenCount  = 0;
    let buffer      = "";

    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines from the buffer
        const lines  = buffer.split("\n");
        buffer       = lines.pop() ?? ""; // last (possibly incomplete) line back to buffer

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data: ")) continue;
            const payload = trimmed.slice(6);
            if (payload === "[DONE]") continue;
            try {
                const chunk   = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
                const content = chunk.choices?.[0]?.delta?.content ?? "";
                if (content) {
                    fullContent += content;
                    tokenCount++;
                    if (tokenCount % 50 === 0) {
                        log.debug(`[${model}] streaming: ${tokenCount} token generati...`);
                    }
                }
            } catch {
                // malformed chunk — skip
            }
        }
    }

    log.debug(`[${model}] stream completato — ${tokenCount} token, ${fullContent.length} chars`);
    return fullContent;
}

// ─── Claude via Anthropic API ────────────────────────────────────────────────

/** Claude via Anthropic API (direct SDK). */
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
        const model    = process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001";
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

        const responseText  = block.text;
        const stopReason    = message.stop_reason ?? undefined;
        const inputTokens   = message.usage.input_tokens;
        const outputTokens  = message.usage.output_tokens;

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

// ─── OpenAI-compatible local model ──────────────────────────────────────────

/** OpenAI-compatible local model (Ollama, Open WebUI, LM Studio, etc.). */
export class OpenAiCompatibleProvider implements AnalyzerProvider {
    readonly name = "openai-compat";

    get maxInputChars(): number {
        return tpmToChars("OPENAI_MODEL_MAX_TPM", 5000);
    }

    async isAvailable(): Promise<boolean> {
        const baseUrl = process.env["OPENAI_BASE_URL"];
        if (!baseUrl) {
            log.debug(`[${this.name}] OPENAI_BASE_URL non impostata`);
            return false;
        }
        const apiKey = process.env["OPENAI_API_KEY"] ?? "ollama";
        try {
            log.debug(`[${this.name}] probe in corso (GET ${baseUrl}/models)...`);
            const res = await fetch(`${baseUrl}/models`, {
                headers: { Authorization: `Bearer ${apiKey}` },
                signal:  AbortSignal.timeout(5000),
            });
            if (!res.ok) {
                log.warn(`[${this.name}] /models ha risposto HTTP ${res.status}`);
                return false;
            }
            const data = await res.json() as { data?: unknown[] };
            const count = data.data?.length ?? "?";
            log.info(`[${this.name}] endpoint raggiungibile — ${count} modelli disponibili`);
            return true;
        } catch (err) {
            log.warn(`[${this.name}] non raggiungibile (${baseUrl}): ${(err as Error).message}`);
            return false;
        }
    }

    async analyzeBatch(
        systemPrompt: string,
        userPromptBatched: string,
    ): Promise<{ date: string; entries: ProposalEntry[] }[]> {
        const model       = process.env["OPENAI_MODEL"] ?? "qwen2.5-coder:3b";
        const promptChars = systemPrompt.length + userPromptBatched.length;
        const timeoutSec  = Math.round(Number(process.env["OPENAI_REQUEST_TIMEOUT_MS"] ?? 900_000) / 1000);
        log.info(`[${this.name}] Invio batch a endpoint OpenAI-compat (${model}) — prompt ~${promptChars} chars, timeout ${timeoutSec}s...`);

        const responseText = await callOpenAiCompatible(systemPrompt, userPromptBatched, model);

        log.info(`[${this.name}] Risposta ricevuta — ${responseText.length} chars`);
        log.debug(`[${this.name}] raw: ${responseText.slice(0, 300)}...`);

        await saveRawResponse({
            provider: this.name,
            model,
            context:  "batch-analysis",
            parsedOk: true,
            raw:      responseText,
        });

        // Strip code fences AND inline JS comments (some models emit // comments in JSON)
        const cleaned = stripJsonComments(stripCodeFence(responseText));
        return JSON.parse(cleaned) as { date: string; entries: ProposalEntry[] }[];
    }
}

// ─── Claude CLI ──────────────────────────────────────────────────────────────

/** Claude via local CLI (uses Claude Code subscription). */
export class ClaudeCliProvider implements AnalyzerProvider {
    readonly name = "claude:cli";

    // No rate-limit env var for CLI — use a generous default (200K tokens context)
    readonly maxInputChars = 200000 * 4;

    async isAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const env = { ...process.env };
            delete env["CLAUDECODE"];
            log.debug(`[${this.name}] probe in corso (claude --version)...`);
            const proc = spawn("claude", ["--version"], { env, stdio: "ignore" });
            proc.on("close",  (code) => {
                if (code === 0) log.info(`[${this.name}] CLI disponibile`);
                else            log.warn(`[${this.name}] CLI ha risposto con codice ${code}`);
                resolve(code === 0);
            });
            proc.on("error", () => {
                log.warn(`[${this.name}] CLI non trovato nel PATH`);
                resolve(false);
            });
        });
    }

    async analyzeBatch(
        systemPrompt: string,
        userPromptBatched: string,
        context = "analysis-cli",
    ): Promise<{ date: string; entries: ProposalEntry[] }[]> {
        const model       = process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001";
        const promptChars = systemPrompt.length + userPromptBatched.length;
        log.info(`[${this.name}] Invio batch tramite CLI (${model}) — prompt ~${promptChars} chars...`);

        const responseText = await callClaudeCli(systemPrompt, userPromptBatched, model);
        log.info(`[${this.name}] Risposta ricevuta — ${responseText.length} chars`);

        const rawPath = await saveRawResponse({
            provider: this.name,
            model,
            context,
            parsedOk: false,
            raw:      responseText,
        });
        log.debug(`[${this.name}] Raw response salvata: ${rawPath}`);

        const parsed = JSON.parse(stripCodeFence(responseText)) as { date: string; entries: ProposalEntry[] }[];
        await saveRawResponse({ provider: this.name, model, context, parsedOk: true, raw: responseText });

        return parsed;
    }
}
