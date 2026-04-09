/**
 * Raw AI response persistence.
 *
 * Saves the unprocessed text from every AI call before parsing, so that
 * token-burning parse failures can be diagnosed and replayed without
 * re-calling the API.
 *
 * Output: data/raw/ai-responses/YYYY-MM-DD_HHmmss_{provider}_{context}.json
 */
import { mkdir } from "fs/promises";
import * as path from "path";
import { writeJson } from "../json-io";

import { getTimestampFilename } from "@shared/dates";

const RAW_DIR = path.join(process.cwd(), "data", "raw", "ai-responses");

export interface RawResponseRecord {
  savedAt: string;
  provider: string;
  model: string;
  /** Human-readable context: "kb-batch-1", "analysis-2026-03-23", etc. */
  context: string;
  stopReason?: string; // Claude: stop_reason / Gemini: finishReason
  inputTokens?: number;
  outputTokens?: number;
  parsedOk: boolean; // updated after parsing attempt
  raw: string;
}

export async function saveRawResponse(
  opts: Omit<RawResponseRecord, "savedAt">,
): Promise<string> {
  await mkdir(RAW_DIR, { recursive: true });

  const now = new Date();
  const safe = opts.context.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
  const filename = `${getTimestampFilename(now)}_${opts.provider}_${safe}.json`;
  const filePath = path.join(RAW_DIR, filename);

  const record: RawResponseRecord = { savedAt: now.toISOString(), ...opts };
  await writeJson(filePath, record);
  return filePath;
}
