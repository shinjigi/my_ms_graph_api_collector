/**
 * Re-export shim — kept for backwards compatibility.
 * Prefer importing directly from the individual provider modules:
 *   claudeApiProvider.ts, ollamaProvider.ts, claudeCliProvider.ts
 */
export { ClaudeApiProvider }         from "./claudeApiProvider";
export { OpenAiCompatibleProvider }  from "./openAiCompatProvider";
export { ClaudeCliProvider }         from "./claudeCliProvider";
