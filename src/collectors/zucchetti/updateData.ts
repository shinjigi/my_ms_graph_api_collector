import { Page, Frame } from 'playwright';
import { parseArgs } from 'node:util';
import { startZucchettiSession } from './session';
import { scrapeSingleDay, validateDay, patchRawZucchettiFile } from './scraper';
import { aggregateSingleDay } from '../../analysis/aggregator';
import type { WeekDayData } from '../../server/routes/week';

// Zucchetti valid giustificativi mapped to the HTML select options
const validActivities = [
    "DONAZIONE SANGUE", "EX FESTIVITA'", "FERIE", "FORMAZIONE",
    "GIORNO PERMESSO STUDIO RETR. A", "PERM. AGG.VO INSERIMENTO ASILO",
    "PERMESSO NON RETRIBUITO MALATTIA FIGLIO 9 -14 ANNI",
    "PERMESSO NON RETRIBUITO MALATTIA FIGLIO FINO 3 ANN",
    "PERMESSO NON RETRIBUITO MALATTIA FIGLIO FINO 8  AN",
    "PERMESSO PER ESAMI", "PERMESSO STUDIO", "RIPOSO COMPENSATIVO",
    "RIPOSO COMPENSATIVO ELEZIONI", "SERVIZIO ESTERNO", "SMART WORKING",
    "Straordinario da autorizzare", "TRASFERTA CON PERNOTTO ALTRI P",
    "TRASFERTA CON PERNOTTO BELGIO", "TRASFERTA CON PERNOTTO BRASILE",
    "TRASFERTA CON PERNOTTO ITALIA", "TRASFERTA CON PERNOTTO PORTOGA",
    "TRASFERTA CON PERNOTTO SPAGNA", "TRASFERTA SENZA PERNOTTO ALTRI",
    "TRASFERTA SENZA PERNOTTO BELGI", "TRASFERTA SENZA PERNOTTO BRASI",
    "TRASFERTA SENZA PERNOTTO ITALI", "TRASFERTA SENZA PERNOTTO PORTO",
    "TRASFERTA SENZA PERNOTTO SPAGN", "VISITA MEDICA"
];

export { validActivities };

export interface ZucchettiRequestParams {
    date:     string;   // YYYY-MM-DD
    type:     string;   // activity name (e.g. "SMART WORKING", "FERIE")
    fullDay:  boolean;
    hours?:   number;
    minutes?: number;
    headless?: boolean;
    scrapeAfterSubmit?: boolean;
}

export interface ZucchettiRequestResult {
    success:      boolean;
    message:      string;
    skipped?:     boolean;       // true if activity already existed
    scrapeError?: string;        // non-null if post-submit scrape failed
    dayUpdate?:   WeekDayData;   // re-aggregated day data for frontend
}

/**
 * After submit (or skip), scrape the current day from the Cartellino,
 * patch the raw Zucchetti file, re-aggregate the day, and return WeekDayData.
 */
async function postSubmitScrape(page: Page, targetDate: string): Promise<WeekDayData> {
    console.log(`[zucchetti] Post-submit scrape for ${targetDate}...`);
    const scraped = await scrapeSingleDay(page, targetDate);
    if (!scraped) throw new Error(`Day ${targetDate} not found in Cartellino grid.`);

    const validated = validateDay(scraped);
    await patchRawZucchettiFile(targetDate, validated);

    const agg = await aggregateSingleDay(targetDate, validated);

    return {
        date:          agg.date,
        isWorkday:     agg.isWorkday,
        oreTarget:     agg.oreTarget,
        location:      agg.location,
        nibol:         null,
        holiday:       !agg.isWorkday,
        zucchetti:     agg.zucchetti,
        calendar:      agg.calendar,
        emails:        agg.emails,
        teams:         agg.teams,
        svnCommits:    agg.svnCommits,
        gitCommits:    agg.gitCommits,
        browserVisits: agg.browserVisits,
    };
}

/**
 * Submits an activity request to the Zucchetti portal via Playwright.
 * Uses the shared session module for login and Cartellino navigation.
 * If scrapeAfterSubmit is true, also scrapes the updated day and re-aggregates.
 */
export async function submitZucchettiRequest(params: ZucchettiRequestParams): Promise<ZucchettiRequestResult> {
    const { date: targetDate, type: rawType, fullDay: isFullDay, hours = 0, minutes = 0, headless = true, scrapeAfterSubmit = false } = params;
    const activityType = rawType.trim().toUpperCase();

    if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
        return { success: false, message: `Invalid date format: "${targetDate}". Expected YYYY-MM-DD.` };
    }

    const matchedActivity = validActivities.find(a => a.toUpperCase().includes(activityType));
    if (!matchedActivity) {
        return { success: false, message: `Activity type "${activityType}" not recognized. Valid: ${validActivities.join(', ')}` };
    }

    // Use shared session for login + Cartellino navigation (headless resolved from env if not explicit)
    const session = await startZucchettiSession(headless);
    const { browser, page: newPage } = session;

    try {
        // Check if activity already exists (and is NOT cancelled)
        console.log(`[zucchetti] Checking existing activities for ${targetDate}...`);
        const dayCell = newPage.locator('td.richieste').filter({ has: newPage.locator(`span[onclick*="${targetDate}"]`) }).first();

        if (await dayCell.count() > 0) {
            const activityRows = dayCell.locator('div.fakeRow');
            const rowCount = await activityRows.count();
            for (let i = 0; i < rowCount; i++) {
                const row = activityRows.nth(i);
                const rowText = await row.innerText();
                if (rowText.toUpperCase().includes(matchedActivity.toUpperCase())) {
                    const isCancelled = await row.locator('span[title="Cancellata"]').count() > 0;
                    if (!isCancelled) {
                        console.log(`[zucchetti] Activity already exists for ${targetDate}. Skipping.`);
                        const result: ZucchettiRequestResult = {
                            success: true,
                            message: `"${matchedActivity}" already exists for ${targetDate}.`,
                            skipped: true,
                        };
                        // Still scrape to refresh day data even when skipping
                        if (scrapeAfterSubmit) {
                            try {
                                result.dayUpdate = await postSubmitScrape(newPage, targetDate);
                            } catch (err) {
                                result.scrapeError = (err as Error).message;
                            }
                        }
                        return result;
                    }
                }
            }
        }

        // Click "Nuova richiesta" for target date
        console.log(`[zucchetti] Submitting "${matchedActivity}" for ${targetDate}...`);
        await newPage.locator(`span[title="Nuova richiesta"][onclick*="${targetDate}"]`).click();

        // Wait for modal and select activity
        await newPage.waitForTimeout(4000);

        try {
            let targetFrame: Page | Frame = newPage;
            const frames = newPage.frames();
            const dropdownSelector = 'select[id$="_Combobox23"], select.Combobox23_ctrl';

            let dropdown = null;
            for (const frame of frames) {
                const found = frame.locator(dropdownSelector).first();
                if (await found.count() > 0) {
                    targetFrame = frame;
                    dropdown = found;
                    break;
                }
            }

            if (!dropdown) {
                dropdown = newPage.locator(dropdownSelector).first();
                await dropdown.waitFor({ state: 'attached', timeout: 5000 });
            }

            await dropdown.selectOption({ label: matchedActivity });
            console.log(`[zucchetti] Selected "${matchedActivity}".`);
            await (targetFrame as Page).waitForTimeout(3000);

            // Handle duration — Zucchetti has TWO "Giornata intera" checkboxes:
            //   InteraBox  (hidden) — used for specific event types
            //   cPeriodoBox (visible) — the standard full-day checkbox
            // We must target the VISIBLE one (cPeriodoBox) first.
            if (isFullDay) {
                console.log('[zucchetti] Checking "Giornata intera" (cPeriodoBox)...');
                const checked = await targetFrame.evaluate(() => {
                    // Find the visible checkbox div — cPeriodoBox is visible for standard activities
                    const cpDiv = document.querySelector<HTMLDivElement>('div[id$="_cPeriodoBox_div"]');
                    if (cpDiv && cpDiv.style.display !== 'none') {
                        const cb = cpDiv.querySelector<HTMLInputElement>('input[type="checkbox"]');
                        if (cb && !cb.checked) {
                            cb.click();
                            return 'cPeriodoBox';
                        }
                        if (cb?.checked) return 'cPeriodoBox-already';
                    }
                    // Fallback: InteraBox
                    const ibDiv = document.querySelector<HTMLDivElement>('div[id$="_InteraBox_div"]');
                    if (ibDiv && ibDiv.style.display !== 'none') {
                        const cb = ibDiv.querySelector<HTMLInputElement>('input[type="checkbox"]');
                        if (cb && !cb.checked) {
                            cb.click();
                            return 'InteraBox';
                        }
                        if (cb?.checked) return 'InteraBox-already';
                    }
                    return null;
                });

                if (checked) {
                    console.log(`[zucchetti] Checked via ${checked}.`);
                } else {
                    throw new Error('Could not find any visible "Giornata intera" checkbox.');
                }
                // Wait for Zucchetti JS to react to the checkbox change
                await (targetFrame as Page).waitForTimeout(1000);
            } else {
                console.log(`[zucchetti] Setting time to ${hours}:${minutes}...`);
                // qtahh/qtamm inputs may be hidden — use evaluate for reliability
                await targetFrame.evaluate(({ h, m }: { h: number; m: number }) => {
                    const hInput = document.querySelector<HTMLInputElement>('input[id$="_qtahh"]');
                    const mInput = document.querySelector<HTMLInputElement>('input[id$="_qtamm"]');
                    if (hInput) {
                        hInput.value = String(h);
                        hInput.dispatchEvent(new Event('change', { bubbles: true }));
                        hInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                    if (mInput) {
                        mInput.value = String(m);
                        mInput.dispatchEvent(new Event('change', { bubbles: true }));
                        mInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                }, { h: hours, m: minutes });
            }

            // Click "Invia"
            console.log('[zucchetti] Clicking Invia...');
            const inviaBtn = targetFrame.locator('input[id$="_InvioButton"]').first();
            await inviaBtn.waitFor({ state: 'visible', timeout: 10000 });
            await inviaBtn.click({ force: true });

        } catch (err) {
            await newPage.screenshot({ path: 'dropdown_error_debug.png', fullPage: true });
            return { success: false, message: `Modal interaction failed: ${(err as Error).message}` };
        }

        // Verification
        console.log('[zucchetti] Verifying submission...');
        const result: ZucchettiRequestResult = { success: true, message: '' };
        try {
            await newPage.waitForTimeout(3000);
            await newPage.waitForSelector(`text=${matchedActivity}`, { state: 'visible', timeout: 15000 });
            console.log(`[zucchetti] Verified "${matchedActivity}" on timesheet for ${targetDate}.`);
            result.message = `"${matchedActivity}" submitted for ${targetDate}.`;
        } catch {
            await newPage.screenshot({ path: 'verification_fyi.png', fullPage: true });
            result.message = `Request sent for ${targetDate}, but verification timed out. Check portal manually.`;
        }

        // Post-submit scrape: reuse the same page to read updated day data
        if (scrapeAfterSubmit) {
            try {
                result.dayUpdate = await postSubmitScrape(newPage, targetDate);
            } catch (err) {
                result.scrapeError = (err as Error).message;
                console.warn(`[zucchetti] Post-submit scrape failed: ${result.scrapeError}`);
            }
        }

        return result;

    } finally {
        await browser.close();
    }
}

// --- CLI entry point ---
if (require.main === module || process.argv[1]?.includes('updateData')) {
    const cliOptions = {
        date:       { type: 'string' as const },
        type:       { type: 'string' as const, default: 'SMART WORKING' },
        'full-day': { type: 'boolean' as const, default: false },
        hours:      { type: 'string' as const, default: '0' },
        minutes:    { type: 'string' as const, default: '0' },
    };

    const { values } = parseArgs({ options: cliOptions, args: process.argv.slice(2), strict: false });

    if (!values.date) {
        console.error('Usage: npm run zucchetti:update -- --date=YYYY-MM-DD [--full-day=true] [--type="SMART WORKING"] [--hours=4] [--minutes=30]');
        process.exit(1);
    }

    submitZucchettiRequest({
        date:     values.date as string,
        type:     values.type as string,
        fullDay:  values['full-day'] as boolean,
        hours:    parseInt(values.hours as string, 10),
        minutes:  parseInt(values.minutes as string, 10),
        // headless resolved from ZUCCHETTI_HEADLESS env var (default true)
    }).then(result => {
        console.log(result.success ? `OK: ${result.message}` : `FAIL: ${result.message}`);
        process.exit(result.success ? 0 : 1);
    }).catch(err => {
        console.error('Fatal:', err);
        process.exit(1);
    });
}
