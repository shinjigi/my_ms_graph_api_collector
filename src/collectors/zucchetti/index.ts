import * as fs    from 'fs/promises';
import * as path  from 'path';
import { spawn }  from 'child_process';
import { readMeta, writeMeta, shouldSkipMonth } from '../utils';

const ZUCC_DIR = path.join(process.cwd(), 'data', 'raw', 'zucchetti');

export interface ZucchettiJustification {
    text: string;
    qta:  string;
}

export interface ZucchettiRequest {
    text:   string;
    qta?:   string;
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
        // Use npx tsx to run the TypeScript automation script
        const proc = spawn('npx', ['tsx', scriptPath, ...args], {
            env: { ...process.env },
            shell: true, // Required for Windows to find npx
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
        throw new Error('Marker JSON non trovati nell\'output di getTimesheet.ts');
    }

    const raw    = output.slice(start + '--- START JSON ---'.length, end).trim();
    const parsed = JSON.parse(raw) as ZucchettiRawResponse | ZucchettiDay[];

    // Handle both wrapped ({ header, days: [...] }) and flat array formats
    return Array.isArray(parsed) ? parsed : parsed.days;
}

async function collectRange(start: string, end: string): Promise<ZucchettiDay[][]> {
    const scriptPath = path.join(__dirname, 'getTimesheet.ts');
    const output = await runScript(scriptPath, [
        `--start=${start}`,
        `--end=${end}`,
    ]);

    const startMarker = '--- START JSON ---';
    const endMarker   = '--- END JSON ---';
    const startIdx = output.indexOf(startMarker);
    const endIdx   = output.indexOf(endMarker);

    if (startIdx === -1 || endIdx === -1) {
        throw new Error('Marker JSON non trovati nell\'output di getTimesheet.ts');
    }

    const raw = output.slice(startIdx + startMarker.length, endIdx).trim();
    const parsed = JSON.parse(raw);
    
    // If it's a single month result, wrap it in an array to match multiple months
    if (parsed.header && parsed.days) {
        return [parsed.days];
    }
    
    // If it's multiple months, it's an array of { month, year, header, days }
    return parsed.map((m: any) => m.days);
}

export async function collectZucchetti(force = false, range?: { start: string, end: string }): Promise<string[]> {
    const since = range?.start ? new Date(range.start + (range.start.length === 7 ? '-01' : '')) : new Date(process.env['COLLECT_SINCE'] ?? '2025-01-01');
    const today = new Date().toISOString().slice(0, 10);
    const now   = range?.end ? new Date(range.end + (range.end.length === 7 ? '-01' : '')) : new Date();

    await fs.mkdir(ZUCC_DIR, { recursive: true });

    const meta     = await readMeta(ZUCC_DIR);
    const outPaths: string[] = [];
    
    // Find earliest month to collect
    let current = new Date(since.getFullYear(), since.getMonth(), 1);
    let firstMonthToCollect: string | null = null;
    let lastMonthToCollect: string = (range?.end ?? today).slice(0, 7);

    while (current <= now) {
        const monthStr = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
        const isCurrentMonth = monthStr === today.slice(0, 7);

        if (force || isCurrentMonth || !shouldSkipMonth(meta[monthStr], monthStr, ['zucchetti'])) {
            if (!firstMonthToCollect) firstMonthToCollect = monthStr;
        }
        current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
    }

    if (!firstMonthToCollect) {
        console.log('  Zucchetti: nothing to collect.');
        return [];
    }

    console.log(`  Zucchetti: collecting range from ${firstMonthToCollect} to ${lastMonthToCollect}...`);
    try {
        const allDays = await collectRange(firstMonthToCollect, lastMonthToCollect);
        
        // Map results back to files
        for (const days of allDays) {
            if (days.length === 0) continue;
            const monthStr = days[0].date.slice(0, 7);
            const outPath = path.join(ZUCC_DIR, `${monthStr}.json`);
            await fs.writeFile(outPath, JSON.stringify(days, null, 2), 'utf-8');
            await writeMeta(ZUCC_DIR, monthStr, { lastExtractedDate: today, sources: ['zucchetti'] });
            outPaths.push(outPath);
            console.log(`    Saved ${monthStr}`);
        }
    } catch (err) {
        console.warn(`  Zucchetti error: ${(err as Error).message}`);
    }

    return outPaths;
}
