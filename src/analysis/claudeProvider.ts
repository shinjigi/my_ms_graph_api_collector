/**
 * Claude analyzer providers: Anthropic API, OpenAI-compatible, and CLI.
 */
import { spawn }         from "node:child_process";
import Anthropic          from "@anthropic-ai/sdk";
import type { AnalyzerProvider, ProposalEntry } from "./analyzer";
import { stripCodeFence } from "./analyzer";
import { createLogger }   from "../logger";
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
    readonly name:    string;
    private readonly backend: "anthropic" | "openai-compat";

    constructor() {
        if (process.env["CLAUDE_API_KEY"]) {
            this.backend = "anthropic";
            this.name    = "claude:anthropic-api";
        } else {
            this.backend = "openai-compat";
            this.name    = "claude:openai-compat";
        }
    }

    isAvailable(): boolean {
        return !!process.env["CLAUDE_API_KEY"] || !!process.env["OPENAI_BASE_URL"];
    }

    async analyze(systemPrompt: string, userPrompt: string, context = "analysis"): Promise<ProposalEntry[]> {
        const model = process.env["CLAUDE_MODEL"]
            ?? process.env["OPENAI_MODEL"]
            ?? "claude-haiku-4-5-20251001";

        let responseText: string;
        let inputTokens: number | undefined;
        let outputTokens: number | undefined;
        let stopReason: string | undefined;

        if (this.backend === "anthropic") {
            const anthropic = new Anthropic({ apiKey: process.env["CLAUDE_API_KEY"] });
            const message   = await anthropic.messages.create({
                model,
                max_tokens: 4096,
                system:     systemPrompt,
                messages:   [{ role: "user", content: userPrompt }],
            });

            const block = message.content[0];
            if (block.type !== "text") throw new Error("Risposta Claude non testuale");

            responseText  = block.text;
            stopReason    = message.stop_reason ?? undefined;
            inputTokens   = message.usage.input_tokens;
            outputTokens  = message.usage.output_tokens;

            log.debug(`Usage: ${inputTokens} in / ${outputTokens} out — stop: ${stopReason}`);

            if (stopReason === "max_tokens") {
                log.warn("Risposta troncata (max_tokens) — JSON probabilmente incompleto");
            }
        } else {
            responseText = await callOpenAiCompatible(systemPrompt, userPrompt, model);
        }

        // Persist raw response before any parsing
        const rawPath = await saveRawResponse({
            provider:     this.name,
            model,
            context,
            stopReason,
            inputTokens,
            outputTokens,
            parsedOk:     false,   // updated below on success
            raw:          responseText,
        });
        log.debug(`Raw response salvata: ${rawPath}`);

        const parsed = JSON.parse(stripCodeFence(responseText)) as ProposalEntry[];

        // Mark file as successfully parsed (best-effort update)
        void saveRawResponse({ provider: this.name, model, context, stopReason, inputTokens, outputTokens, parsedOk: true, raw: responseText });

        return parsed;
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
