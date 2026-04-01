/**
 * OpenAI-compatible analyzer provider (Ollama, Open WebUI, LM Studio, OpenRouter, etc.).
 *
 * Uses SSE streaming to keep the TCP connection alive during long CPU-bound inference,
 * preventing OS/router/proxy timeouts on silent long-running requests.
 *
 * Key env vars:
 *   OPENAI_BASE_URL          — required; e.g. http://localhost:11434/v1
 *   OPENAI_API_KEY           — optional; defaults to "ollama"
 *   OPENAI_MODEL             — model name; defaults to "qwen2.5-coder:3b"
 *   OPENAI_MODEL_MAX_TPM     — input token budget (chars = tokens × 4); default 5000
 *   OPENAI_NUM_CTX           — Ollama context window in tokens; defaults to OPENAI_MODEL_MAX_TPM
 *   OPENAI_REQUEST_TIMEOUT_MS — streaming timeout in ms; default 900 000 (15 min)
 */
import {
  AnalyzerProvider,
  SignalDetail,
  stripCodeFence,
  stripJsonComments,
  tpmToChars,
} from "./base";
import { createLogger } from "../logger";
import { saveRawResponse } from "./aiRaw";
import { ProposalEntry } from "@shared/analysis";

const log = createLogger("ollama");

/**
 * Calls an OpenAI-compatible endpoint using SSE streaming.
 * Streaming keeps the TCP connection alive during long CPU inference.
 */
async function callOpenAiCompatible(
  systemPrompt: string,
  userPrompt: string,
  model: string,
): Promise<string> {
  const baseUrl = process.env["OPENAI_BASE_URL"]!;
  const apiKey = process.env["OPENAI_API_KEY"] ?? "ollama";
  const timeoutMs = Number(process.env["OPENAI_REQUEST_TIMEOUT_MS"] ?? 900_000);
  // num_ctx: Ollama context window in tokens. Defaults to OPENAI_MODEL_MAX_TPM for backwards
  // compatibility, but should be set independently via OPENAI_NUM_CTX so that the input budget
  // (OPENAI_MODEL_MAX_TPM) can be a safe fraction of the context (e.g. 25%) without shrinking
  // the actual model window.
  const numCtx = Number(
    process.env["OPENAI_NUM_CTX"] ??
      process.env["OPENAI_MODEL_MAX_TPM"] ??
      5000,
  );

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
      max_tokens: 4096,
      stream: true, // SSE keeps TCP alive during long CPU inference
      options: { num_ctx: numCtx },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenAI-compatible API error ${response.status}: ${text}`);
  }
  if (!response.body)
    throw new Error("Risposta senza body (streaming non supportato?)");

  // Collect SSE stream: each line is "data: <json>" or "data: [DONE]"
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullContent = "";
  let tokenCount = 0;
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data: ")) continue;
      const payload = trimmed.slice(6);
      if (payload === "[DONE]") continue;
      try {
        const chunk = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
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

  log.debug(
    `[${model}] stream completato — ${tokenCount} token, ${fullContent.length} chars`,
  );
  return fullContent;
}

export class OpenAiCompatibleProvider implements AnalyzerProvider {
  readonly name = "openai-compat";

  get maxInputChars(): number {
    return tpmToChars("OPENAI_MODEL_MAX_TPM", 5000);
  }

  /**
   * Small local models hallucinate when given long KB lists.
   * Configurable via OPENAI_KB_ITEM_CAP; default 20.
   */
  get kbItemCap(): number {
    return Number(process.env["OPENAI_KB_ITEM_CAP"] ?? 20);
  }

  /**
   * Compact signals by default for small local models.
   * Override via OPENAI_SIGNAL_DETAIL=full|compact|minimal.
   */
  get signalDetail(): SignalDetail {
    const val = process.env["OPENAI_SIGNAL_DETAIL"] ?? "compact";
    if (val === "full" || val === "compact" || val === "minimal") return val;
    return "compact";
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
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        log.warn(`[${this.name}] /models ha risposto HTTP ${res.status}`);
        return false;
      }
      const data = (await res.json()) as { data?: unknown[] };
      const count = data.data?.length ?? "?";
      log.info(
        `[${this.name}] endpoint raggiungibile — ${count} modelli disponibili`,
      );
      return true;
    } catch (err) {
      log.warn(
        `[${this.name}] non raggiungibile (${baseUrl}): ${(err as Error).message}`,
      );
      return false;
    }
  }

  async analyzeBatch(
    systemPrompt: string,
    userPromptBatched: string,
  ): Promise<{ date: string; entries: ProposalEntry[] }[]> {
    const model = process.env["OPENAI_MODEL"] ?? "qwen2.5-coder:3b";
    const promptChars = systemPrompt.length + userPromptBatched.length;
    const timeoutSec = Math.round(
      Number(process.env["OPENAI_REQUEST_TIMEOUT_MS"] ?? 900_000) / 1000,
    );
    log.info(
      `[${this.name}] Invio batch a endpoint OpenAI-compat (${model}) — prompt ~${promptChars} chars, timeout ${timeoutSec}s...`,
    );

    const responseText = await callOpenAiCompatible(
      systemPrompt,
      userPromptBatched,
      model,
    );

    log.info(`[${this.name}] Risposta ricevuta — ${responseText.length} chars`);
    log.debug(`[${this.name}] raw: ${responseText.slice(0, 300)}...`);

    await saveRawResponse({
      provider: this.name,
      model,
      context: "batch-analysis",
      parsedOk: true,
      raw: responseText,
    });

    // Strip code fences AND inline JS comments (some models emit // comments in JSON)
    const cleaned = stripJsonComments(stripCodeFence(responseText));
    return JSON.parse(cleaned) as { date: string; entries: ProposalEntry[] }[];
  }
}
