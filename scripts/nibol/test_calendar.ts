import { nibolFetchCalendarData } from '../../src/collectors/nibol';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function main() {
    console.log('[Nibol] Testing Calendar Data Fetching...');
    
    // Testing with a range for March 2026
    const range = {
        start: '2026-03-01',
        end: '2026-03-31'
    };

    let bookings: any[] = [];
    let success = false;
    const maxRetries = 3;

    for (let i = 0; i < maxRetries; i++) {
        try {
            console.log(`[Nibol] Attempt ${i + 1}/${maxRetries}...`);
            bookings = await nibolFetchCalendarData(range);
            success = true;
            break;
        } catch (error) {
            console.error(`[Nibol] Attempt ${i + 1} failed:`, error);
            if (i === maxRetries - 1) throw error;
            console.log('[Nibol] Retrying in 5 seconds...');
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    if (success) {
        console.log(`[Nibol] Found ${bookings.length} bookings.`);
        console.table(bookings);

        // Save results to a file for verification
        const outputPath = path.join(process.cwd(), 'data', 'nibol_calendar_test.json');
        if (!fs.existsSync(path.dirname(outputPath))) {
            fs.mkdirSync(path.dirname(outputPath), { recursive: true });
        }
        
        fs.writeFileSync(outputPath, JSON.stringify(bookings, null, 2));
        console.log(`[Nibol] Results saved to: ${outputPath}`);
    }
}

main();
