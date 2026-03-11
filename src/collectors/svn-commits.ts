import * as fs         from 'fs/promises';
import * as path       from 'path';
import { spawn }       from 'child_process';
import { parseString } from 'xml2js';
import { promisify }   from 'util';

const parseXml = promisify(parseString);
const RAW_DIR  = path.join(process.cwd(), 'data', 'raw');

export interface SvnCommit {
    revision: string;
    author:   string;
    date:     string;   // ISO date string
    message:  string;
    paths:    string[];
}

function runSvn(args: string[], svnBin: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const chunks: Buffer[] = [];
        const proc = spawn(svnBin, args, { env: { ...process.env } });

        proc.stdout.on('data', (chunk: Buffer) => chunks.push(chunk));
        proc.stderr.on('data', (chunk: Buffer) => process.stderr.write(chunk));
        proc.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`svn exited with code ${code}`));
            } else {
                resolve(Buffer.concat(chunks).toString('utf-8'));
            }
        });
        proc.on('error', reject);
    });
}

export async function collectSvnCommits(): Promise<string> {
    const svnUrl  = process.env['SVN_URL'];
    const svnBin  = process.env['SVN_BIN'] ?? 'svn';
    const since   = process.env['COLLECT_SINCE'] ?? '2025-01-01';
    const user    = process.env['SVN_USERNAME'];
    const pass    = process.env['SVN_PASSWORD'];

    if (!svnUrl) {
        console.warn('SVN_URL non configurato — collector SVN saltato.');
        return path.join(RAW_DIR, 'svn-commits.json');
    }

    const args = ['log', '--xml', '-r', `{${since}}:HEAD`, '--limit', '2000'];

    if (user && pass) {
        args.push('--username', user, '--password', pass, '--no-auth-cache');
    }

    args.push(svnUrl);

    let xmlOutput: string;
    try {
        xmlOutput = await runSvn(args, svnBin);
    } catch (err) {
        console.warn(`SVN log fallito: ${(err as Error).message}. Collector saltato.`);
        await fs.mkdir(RAW_DIR, { recursive: true });
        const outPath = path.join(RAW_DIR, 'svn-commits.json');
        await fs.writeFile(outPath, '[]', 'utf-8');
        return outPath;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = await parseXml(xmlOutput) as any;
    const entries = parsed?.log?.logentry ?? [];

    const commits: SvnCommit[] = entries.map((e: {
        $: { revision: string };
        author: string[];
        date:   string[];
        msg:    string[];
        paths?: Array<{ path: Array<{ _: string }> }>;
    }) => ({
        revision: e.$.revision,
        author:   (e.author ?? [''])[0],
        date:     new Date((e.date ?? [''])[0]).toISOString().slice(0, 10),
        message:  ((e.msg ?? [''])[0] ?? '').trim(),
        paths:    (e.paths?.[0]?.path ?? []).map((p: { _: string }) => p._),
    }));

    await fs.mkdir(RAW_DIR, { recursive: true });
    const outPath = path.join(RAW_DIR, 'svn-commits.json');
    await fs.writeFile(outPath, JSON.stringify(commits, null, 2), 'utf-8');
    return outPath;
}
