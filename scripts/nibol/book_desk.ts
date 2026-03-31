import { nibolBookDesk } from '../../src/collectors/nibol';
import * as dotenv from 'dotenv';
import { dateToString } from '../../shared/dates';

dotenv.config();

/**
 * Standalone TypeScript script to book a desk on Nibol.
 * Migrated from book_desk.js
 */
async function main() {
    const args = process.argv.slice(2);
    const dateArg = args.find(a => a.startsWith('--date='))?.split('=')[1];
    
    // Default to today if no date provided
    const date = dateArg || dateToString();

    console.log(`[Nibol] Booking desk for date: ${date}`);
    
    try {
        await nibolBookDesk(date);
        console.log(`[Nibol] Success for ${date}`);
    } catch (error) {
        console.error(`[Nibol] Failed to book desk for ${date}:`, error);
        process.exit(1);
    }
}

main();
