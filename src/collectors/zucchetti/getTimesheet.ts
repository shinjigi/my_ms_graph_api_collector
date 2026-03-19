import { parseArgs } from 'node:util';
import { startZucchettiSession } from './session';
import { scrapeCartellino, validateDay } from './scraper';

const options = {
    date:  { type: 'string' as const }, // YYYY-MM-DD to identify the month
    month: { type: 'string' as const }, // 1-12
    year:  { type: 'string' as const }, // YYYY
};

const args = process.argv.slice(2);
const { values } = parseArgs({ options, args, strict: false });

let targetMonth = values.month as string | undefined;
let targetYear = values.year as string | undefined;

// If date is provided, extract month and year from it
if (values.date) {
    const d = new Date(values.date as string);
    if (!isNaN(d.getTime())) {
        targetMonth = (d.getMonth() + 1).toString();
        targetYear = d.getFullYear().toString();
    }
}

(async () => {
    // Use shared session for login + Cartellino navigation
    const session = await startZucchettiSession(false);
    const { browser, page: newPage } = session;

    // Select target Month/Year if provided.
    // Zucchetti triggers a partial page reload on every select change; re-query each
    // element after the reload and verify the value actually took effect.
    if (targetMonth || targetYear) {
        console.log(`Setting target period to ${targetMonth}/${targetYear}...`);

        const waitStable = async () => {
            await newPage.waitForLoadState('networkidle');
            await newPage.waitForSelector('select[id$="_TxtAnno"]:not([disabled])', { state: 'visible', timeout: 15000 });
            await newPage.waitForSelector('select[id$="_TxtMese"]:not([disabled])', { state: 'visible', timeout: 15000 });
        };

        if (targetYear) {
            console.log("Selecting Year...");
            const yearSelect = newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first();
            await yearSelect.selectOption(targetYear);
            await waitStable();
            const actualYear = await newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first().inputValue();
            if (actualYear !== targetYear) {
                console.warn(`Year select retry (got ${actualYear}, expected ${targetYear})...`);
                await newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first().selectOption(targetYear);
                await waitStable();
            }
            await newPage.locator('#rif_mbbody').waitFor({ state: 'detached' });
        }

        if (targetMonth) {
            console.log("Selecting Month...");
            const monthSelect = newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first();
            await monthSelect.selectOption(targetMonth);
            await waitStable();
            const actualMonth = await newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first().inputValue();
            if (actualMonth !== targetMonth) {
                console.warn(`Month select retry (got ${actualMonth}, expected ${targetMonth})...`);
                await newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first().selectOption(targetMonth);
                await waitStable();
            }
            await newPage.locator('#rif_mbbody').waitFor({ state: 'detached' });
        }
    }

    console.log("Extracting timesheet data...");

    const { header, days } = await scrapeCartellino(newPage);
    const validatedData = days.map(d => validateDay(d));

    console.log("--- START JSON ---");
    console.log(JSON.stringify({ header, days: validatedData }, null, 2));
    console.log("--- END JSON ---");

    await browser.close();
})();
