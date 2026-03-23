/**
 * Raw AI response persistence.
 *
 * Saves the unprocessed text from every AI call before parsing, so that
 * token-burning parse failures can be diagnosed and replayed without
 * re-calling the API.
 *
 * Output: data/raw/ai-responses/YYYY-MM-DD_HHmmss_{provider}_{context}.json
 */
import * as fs   from 'fs/promises';
import * as path from 'path';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw', 'ai-responses');

export interface RawResponseRecord {
    savedAt:      string;
    provider:     string;
    model:        string;
    /** Human-readable context: "kb-batch-1", "analysis-2026-03-23", etc. */
    context:      string;
    stopReason?:  string;    // Claude: stop_reason / Gemini: finishReason
    inputTokens?: number;
    outputTokens?: number;
    parsedOk:     boolean;   // updated after parsing attempt
    raw:          string;
}

export async function saveRawResponse(opts: Omit<RawResponseRecord, 'savedAt'>): Promise<string> {
    await fs.mkdir(RAW_DIR, { recursive: true });

    const now      = new Date();
    const date     = now.toISOString().slice(0, 10);
    const time     = now.toTimeString().slice(0, 8).replace(/:/g, '');
    const safe     = opts.context.replace(/[^a-zA-Z0-9_-]/g, '-');
    const filename = `${date}_${time}_${opts.provider}_${safe}.json`;
    const filePath = path.join(RAW_DIR, filename);

    const record: RawResponseRecord = { savedAt: now.toISOString(), ...opts };
    await fs.writeFile(filePath, JSON.stringify(record, null, 2), 'utf-8');
    return filePath;
}
