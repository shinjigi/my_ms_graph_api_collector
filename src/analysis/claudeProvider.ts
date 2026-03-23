/**
 * Claude analyzer providers: Anthropic API, OpenAI-compatible, and CLI.
 */
import { spawn } from "node:child_process";
import Anthropic from "@anthropic-ai/sdk";
import type { AnalyzerProvider, ProposalEntry } from "./analyzer";
import { BatchAnalyzerProvider, stripCodeFence } from "./analyzer";

/** Calls the local `claude` CLI (Claude Code subscription) in non-interactive mode. */
function callClaudeCli(
    systemPrompt: string,
    userPrompt: string,
    model: string,
): Promise<string> {
    return new Promise((resolve, reject) => {
        // Unset CLAUDECODE to allow subprocess invocation outside an active session
        const env = { ...process.env, CLAUDECODE: undefined };
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
        proc.on("error", reject);
    });
}

/**
 * Calls an OpenAI-compatible API (Ollama, LM Studio, OpenRouter, etc.).
 * Requires OPENAI_BASE_URL and optionally OPENAI_API_KEY.
 */
async function callOpenAiCompatible(
    systemPrompt: string,
    userPrompt: string,
    model: string,
): Promise<string> {
    const baseUrl = process.env["OPENAI_BASE_URL"]!;
    const apiKey = process.env["OPENAI_API_KEY"] ?? "ollama";

    const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
            model,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt },
            ],
            max_tokens: 1024,
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

    async analyze(systemPrompt: string, userPrompt: string): Promise<ProposalEntry[]> {
        const model = process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001";
        const anthropic = new Anthropic({ apiKey: process.env["CLAUDE_API_KEY"] });
        const message = await anthropic.messages.create({
            model,
            max_tokens: 1024 * 8, // Need more tokens potentially
            system: systemPrompt,
            messages: [{ role: "user", content: userPrompt }],
        });
        const block = message.content[0];
        if (block.type !== "text") throw new Error("Risposta Claude non testuale");
        return JSON.parse(stripCodeFence(block.text)) as ProposalEntry[];
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
        const responseText = await callOpenAiCompatible(systemPrompt, userPromptBatched, model);
        return JSON.parse(stripCodeFence(responseText)) as {date: string, entries: ProposalEntry[]}[];
    }
}

/** Claude via local CLI (uses Claude Code subscription). */
export class ClaudeCliProvider implements AnalyzerProvider {
    readonly name = "claude:cli";

    isAvailable(): boolean {
        return true;
    }

    async analyze(systemPrompt: string, userPrompt: string): Promise<ProposalEntry[]> {
        const model = process.env["CLAUDE_MODEL"] ?? "claude-haiku-4-5-20251001";
        const responseText = await callClaudeCli(systemPrompt, userPrompt, model);
        return JSON.parse(stripCodeFence(responseText)) as ProposalEntry[];
    }
}
