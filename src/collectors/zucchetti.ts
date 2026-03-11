import * as fs    from 'fs/promises';
import * as path  from 'path';
import { spawn }  from 'child_process';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

export interface ZucchettiJustification {
    text: string;
    qta:  string;
}

export interface ZucchettiRequest {
    text:   string;
    status: string;
}

export interface ZucchettiDay {
    date:            string;     // YYYY-MM-DD
    dayOfWeek:       string;
    hOrd:            string;     // e.g. "7:42" or "" for holidays
    orario:          string;     // e.g. "N02", "DOM", "SAB"
    giustificativi:  ZucchettiJustification[];
    richieste:       ZucchettiRequest[];
    warnings:        string[];
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

function extractJson(output: string): ZucchettiDay[] {
    const start = output.indexOf('--- START JSON ---');
    const end   = output.indexOf('--- END JSON ---');

    if (start === -1 || end === -1) {
        throw new Error('Marker JSON non trovati nell\'output di get_timesheet_json.js');
    }

    const raw = output.slice(start + '--- START JSON ---'.length, end).trim();
    return JSON.parse(raw) as ZucchettiDay[];
}

async function collectMonth(year: number, month: number): Promise<ZucchettiDay[]> {
    const scriptPath = path.join(process.cwd(), 'zucchetti_automation', 'get_timesheet_json.js');

    const output = await runScript(scriptPath, [
        `--month=${month}`,
        `--year=${year}`,
    ]);

    return extractJson(output);
}

export async function collectZucchetti(): Promise<string[]> {
    const since = new Date(process.env['COLLECT_SINCE'] ?? '2025-01-01');
    const now   = new Date();

    await fs.mkdir(RAW_DIR, { recursive: true });

    const outPaths: string[] = [];
    let   current  = new Date(since.getFullYear(), since.getMonth(), 1);

    while (current <= now) {
        const year  = current.getFullYear();
        const month = current.getMonth() + 1;

        try {
            console.log(`  Zucchetti: raccolta ${year}-${String(month).padStart(2, '0')}...`);
            const days    = await collectMonth(year, month);
            const outPath = path.join(RAW_DIR, `zucchetti-${year}-${String(month).padStart(2, '0')}.json`);
            await fs.writeFile(outPath, JSON.stringify(days, null, 2), 'utf-8');
            outPaths.push(outPath);
        } catch (err) {
            console.warn(`  Zucchetti ${year}-${month}: ${(err as Error).message}`);
        }

        // Advance to next month
        current = new Date(year, month, 1);
    }

    return outPaths;
}
