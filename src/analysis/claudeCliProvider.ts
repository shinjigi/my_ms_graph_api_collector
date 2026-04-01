/**
 * Claude analyzer provider — local Claude Code CLI (`claude -p`).
 * Uses the Claude Code subscription (no API key required).
 */
import { spawn } from "node:child_process";
import { AnalyzerProvider, stripCodeFence, tpmToChars } from "./base";
import { createLogger } from "../logger";
import { saveRawResponse } from "../aiRaw";
import { ProposalEntry } from "@shared/analysis";

const log = createLogger("claude-cli");

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

export class ClaudeCliProvider implements AnalyzerProvider {
    readonly name = "claude:cli";

    // No rate-limit env var for CLI — use a generous default (200K tokens context)
    readonly maxInputChars = tpmToChars("CLAUDE_CLI_MAX_TPM", 200000);

    async isAvailable(): Promise<boolean> {
        return new Promise((resolve) => {
            const env = { ...process.env };
            delete env["CLAUDECODE"];
            log.debug(`[${this.name}] probe in corso (claude --version)...`);
            const proc = spawn("claude", ["--version"], { env, stdio: "ignore" });
            proc.on("close", (code) => {
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
