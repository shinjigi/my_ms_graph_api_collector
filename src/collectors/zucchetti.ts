import * as fs    from 'fs/promises';
import * as path  from 'path';
import { spawn }  from 'child_process';
import { readMeta, writeMeta, shouldSkipMonth } from './utils';

const ZUCC_DIR = path.join(process.cwd(), 'data', 'raw', 'zucchetti');

export interface ZucchettiJustification {
    text: string;
    qta:  string;
}

export interface ZucchettiRequest {
    text:   string;
    status: string;
}

export interface ZucchettiDay {
    date:           string;     // YYYY-MM-DD
    dayOfWeek:      string;
    timbrature:     string;
    hOrd:           string;     // e.g. "7:42" or "" for holidays/weekends
    hEcc:           string;     // overtime hours
    orario:         string;     // e.g. "N02", "DOM", "SAB"
    giustificativi: ZucchettiJustification[];
    richieste:      ZucchettiRequest[];
    warnings:       string[];
}

function runScript(scriptPath: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const proc = spawn(process.execPath, [scriptPath, ...args], {
            env: { ...process.env },
        });

        proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        proc.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Script exited with code ${code}`));
            } else {
                resolve(Buffer.concat(chunks).toString('utf-8'));
            }
        });
        proc.on('error', reject);
    });
}

interface ZucchettiRawResponse {
    header: unknown;
    days:   ZucchettiDay[];
}

function extractJson(output: string): ZucchettiDay[] {
    const start = output.indexOf('--- START JSON ---');
    const end   = output.indexOf('--- END JSON ---');

    if (start === -1 || end === -1) {
        throw new Error('Marker JSON non trovati nell\'output di get_timesheet_json.js');
    }

    const raw    = output.slice(start + '--- START JSON ---'.length, end).trim();
    const parsed = JSON.parse(raw) as ZucchettiRawResponse | ZucchettiDay[];

    // Handle both wrapped ({ header, days: [...] }) and flat array formats
    return Array.isArray(parsed) ? parsed : parsed.days;
}

async function collectMonth(year: number, month: number): Promise<ZucchettiDay[]> {
    const scriptPath = path.join(process.cwd(), 'zucchetti_automation', 'get_timesheet_json.js');

    const output = await runScript(scriptPath, [
        `--month=${month}`,
        `--year=${year}`,
    ]);

    return extractJson(output);
}

export async function collectZucchetti(force = false): Promise<string[]> {
    const since = new Date(process.env['COLLECT_SINCE'] ?? '2025-01-01');
    const today = new Date().toISOString().slice(0, 10);
    const now   = new Date();

    await fs.mkdir(ZUCC_DIR, { recursive: true });

    const meta     = await readMeta(ZUCC_DIR);
    const outPaths: string[] = [];
    let   current  = new Date(since.getFullYear(), since.getMonth(), 1);

    while (current <= now) {
        const year  = current.getFullYear();
        const month = current.getMonth() + 1;
        const monthStr       = `${year}-${String(month).padStart(2, '0')}`;
        const isCurrentMonth = monthStr === today.slice(0, 7);
        const outPath        = path.join(ZUCC_DIR, `${monthStr}.json`);

        if (!force && !isCurrentMonth && shouldSkipMonth(meta[monthStr], monthStr, ['zucchetti'])) {
            console.log(`  Zucchetti: ${monthStr}: skip`);
            outPaths.push(outPath);
        } else {
            try {
                console.log(`  Zucchetti: raccolta ${monthStr}...`);
                const days = await collectMonth(year, month);
                await fs.writeFile(outPath, JSON.stringify(days, null, 2), 'utf-8');
                await writeMeta(ZUCC_DIR, monthStr, { lastExtractedDate: today, sources: ['zucchetti'] });
                outPaths.push(outPath);
            } catch (err) {
                console.warn(`  Zucchetti ${monthStr}: ${(err as Error).message}`);
            }
        }

        // Advance to next month
        current = new Date(year, month, 1);
    }

    return outPaths;
}
