import * as fs   from 'fs/promises';
import * as path from 'path';
import { execSync } from 'child_process';
import { globSync } from 'glob';

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

export interface GitCommit {
    hash:    string;
    author:  string;
    email:   string;
    date:    string;   // YYYY-MM-DD
    message: string;
    repo:    string;
}

function findGitRepos(root: string): string[] {
    try {
        const gitDirs = globSync('**/.git', {
            cwd:          root,
            absolute:     true,
            dot:          true,
            maxDepth:     4,
            ignore:       ['**/node_modules/**'],
        });
        return gitDirs.map(g => path.dirname(g));
    } catch {
        return [];
    }
}

function getCommitsFromRepo(repoPath: string, since: string): GitCommit[] {
    const SEP  = '\x1F';
    const REC  = '\x1E';
    const fmt  = `--format=%H${SEP}%an${SEP}%ae${SEP}%ad${SEP}%s${REC}`;

    try {
        const out = execSync(
            `git log ${fmt} --date=short --since="${since}" --all`,
            { cwd: repoPath, encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
        );

        return out.split(REC)
            .map(r => r.trim())
            .filter(r => r.length > 0)
            .map(r => {
                const [hash, author, email, date, ...msgParts] = r.split(SEP);
                return {
                    hash:    hash ?? '',
                    author:  author ?? '',
                    email:   email ?? '',
                    date:    date ?? '',
                    message: msgParts.join(SEP).trim(),
                    repo:    path.basename(repoPath),
                };
            });
    } catch {
        return [];
    }
}

export async function collectGitCommits(): Promise<string> {
    const roots = (process.env['GIT_ROOTS'] ?? '').split(';').map(r => r.trim()).filter(Boolean);
    const since = process.env['COLLECT_SINCE'] ?? '2025-01-01';

    if (roots.length === 0) {
        console.warn('GIT_ROOTS non configurato — collector Git saltato.');
        return path.join(RAW_DIR, 'git-commits.json');
    }

    const allCommits: GitCommit[] = [];

    for (const root of roots) {
        const repos = findGitRepos(root);
        for (const repo of repos) {
            const commits = getCommitsFromRepo(repo, since);
            allCommits.push(...commits);
        }
    }

    await fs.mkdir(RAW_DIR, { recursive: true });
    const outPath = path.join(RAW_DIR, 'git-commits.json');
    await fs.writeFile(outPath, JSON.stringify(allCommits, null, 2), 'utf-8');
    return outPath;
}
