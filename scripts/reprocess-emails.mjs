import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';

dotenv.config();

const EMAIL_DIR = path.join(process.cwd(), 'data', 'raw', 'graph-email');
const SORT_BY_COUNT = false; // Se true, ordina per numero di messaggi (desc), altrimenti per dominio
const MIN_COUNT = 10; // Numerosità minima per mostrare l'indirizzo nel report

async function run() {
  const excludeList = (process.env["EMAIL_EXCLUDE_ADDRESSES"] ?? "")
    .split(";")
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);

  const files = await fs.readdir(EMAIL_DIR);
  const monthFiles = files.filter(f => /^\d{4}-\d{2}\.json$/.test(f));

  const stats = new Map(); // address -> count

  for (const file of monthFiles) {
    const month = file.replace('.json', '');
    const filePath = path.join(EMAIL_DIR, file);
    const exclPath = path.join(EMAIL_DIR, `${month}.excluded.json`);

    const content = JSON.parse(await fs.readFile(filePath, 'utf-8'));
    
    const kept = [];
    const newlyExcluded = [];

    for (const msg of content) {
      const addr = msg.from?.emailAddress?.address?.toLowerCase();
      if (!addr) {
        kept.push(msg);
        continue;
      }

      // Update stats
      stats.set(addr, (stats.get(addr) || 0) + 1);

      if (excludeList.includes(addr)) {
        newlyExcluded.push(msg);
      } else {
        kept.push(msg);
      }
    }

    // If we found emails to move
    if (newlyExcluded.length > 0) {
      console.log(`[${month}] Spostamento di ${newlyExcluded.length} email in .excluded.json...`);
      
      // Load existing excluded if any
      let existingExcluded = [];
      try {
        existingExcluded = JSON.parse(await fs.readFile(exclPath, 'utf-8'));
      } catch (e) {
        console.error(`file doesn't exist, it's fine`, e)
      }

      // Merge by ID to avoid duplicates
      const mergedExcl = [...existingExcluded];
      const existingIds = new Set(existingExcluded.map(m => m.id));
      
      for (const m of newlyExcluded) {
        if (!existingIds.has(m.id)) {
          mergedExcl.push(m);
        }
      }

      // Write both files back
      await fs.writeFile(filePath, JSON.stringify(kept, null, 2));
      await fs.writeFile(exclPath, JSON.stringify(mergedExcl, null, 2));
    }
  }

  // --- Printing Report ---
  console.log(`\n--- REPORT MITTENTI (Ordinato per ${SORT_BY_COUNT ? 'Numerosità' : 'Dominio'}, Min: ${MIN_COUNT}) ---`);
  
  const report = Array.from(stats.entries()).map(([email, count]) => {
    const [name, domain] = email.split('@');
    return { email, name, domain: domain || '', count };
  });

  // Sort logic
  report.sort((a, b) => {
    if (SORT_BY_COUNT) {
      return b.count - a.count; // Top messages first
    }
    const domComp = a.domain.localeCompare(b.domain);
    if (domComp !== 0) return domComp;
    return a.name.localeCompare(b.name);
  });

  console.log('Count'.padEnd(8) + ' | ' + 'Email');
  console.log('-'.repeat(50));
  
  for (const item of report) {
    if (item.count < MIN_COUNT) continue;
    
    const isExcluded = excludeList.includes(item.email);
    const prefix = isExcluded ? '[EXCL] ' : '       ';
    console.log(item.count.toString().padEnd(8) + ' | ' + prefix + item.email);
  }
}

run().catch(console.error);
