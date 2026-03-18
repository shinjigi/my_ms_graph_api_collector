import { chromium, BrowserContext, Page, Frame } from 'playwright';
import { parseArgs } from 'node:util';

// Reusing same options for consistency
const options = {
    date: { type: 'string' as const }, // YYYY-MM-DD to identify the month
    month: { type: 'string' as const }, // 1-12
    year: { type: 'string' as const },  // YYYY
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
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page: Page = await context.newPage();

    console.log("Navigating to Zucchetti portal...");
    await page.goto('https://saas.hrzucchetti.it/hrpzcs01/jsp/home.jsp');

    // Login
    const username = process.env.ZUCCHETTI_USERNAME;
    const password = process.env.ZUCCHETTI_PASSWORD;

    if (!username || !password) {
        console.error("Error: ZUCCHETTI_USERNAME or ZUCCHETTI_PASSWORD not found.");
        process.exit(1);
    }

    await page.waitForSelector('input[placeholder="Username"], input[name*="UserName"]', { state: 'visible', timeout: 30000 });
    await page.locator('input[placeholder="Username"], input[name*="UserName"]').first().fill(username);
    await page.locator('input[placeholder="Password"], input[type="password"]').first().fill(password);
    
    await page.locator('button, input[type="submit"], input[type="button"], a')
        .filter({ hasText: /Login|Accedi/i })
        .first()
        .click();

    // Check for "Comunicazioni" popup (common on Zucchetti)
    try {
        const popupCloseButton = page.locator('[id^="spModalLayer_closebtn"]');
        await popupCloseButton.waitFor({ state: 'visible', timeout: 3000 });
        console.log("Closing Zucchetti initial popup...");
        await popupCloseButton.click();
    } catch (e) {
        // Not present or didn't appear in time
    }

    // Navigate to Cartellino
    await page.waitForSelector('a[title="Servizi aggiuntivi"]', { state: 'visible', timeout: 30000 });
    await page.click('a[title="Servizi aggiuntivi"]');
    await page.getByText('Cartellino Mensile', { exact: false }).click();

    const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 90000 }),
    ]);
    await newPage.waitForLoadState('networkidle');

    // Aspetta che l'elemento del loading venga rimosso fisicamente dal DOM
    await newPage.locator('#rif_mbbody').waitFor({ state: 'detached' });

    // Select target Month/Year if provided.
    // Zucchetti triggers a partial page reload on every select change; re-query each
    // element after the reload and verify the value actually took effect.
    if (targetMonth || targetYear) {
        console.log(`Setting target period to ${targetMonth}/${targetYear}...`);

        const waitStable = async () => {
            await newPage.waitForLoadState('networkidle');
            // Re-wait until both selects are visible and not disabled
            await newPage.waitForSelector('select[id$="_TxtAnno"]:not([disabled])', { state: 'visible', timeout: 15000 });
            await newPage.waitForSelector('select[id$="_TxtMese"]:not([disabled])', { state: 'visible', timeout: 15000 });
        };

        if (targetYear) {
            console.log("Selecting Year...");
            const yearSelect = newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first();
            await yearSelect.selectOption(targetYear);
            await waitStable();
            // Verify the value was applied; retry once if not
            const actualYear = await newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first().inputValue();
            if (actualYear !== targetYear) {
                console.warn(`Year select retry (got ${actualYear}, expected ${targetYear})...`);
                await newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first().selectOption(targetYear);
                await waitStable();
            }

            // Aspetta che l'elemento del loading venga rimosso fisicamente dal DOM
            await newPage.locator('#rif_mbbody').waitFor({ state: 'detached' });
        }

        if (targetMonth) {
            console.log("Selecting Month...");
            const monthSelect = newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first();
            await monthSelect.selectOption(targetMonth);
            await waitStable();
            // Verify the value was applied; retry once if not
            const actualMonth = await newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first().inputValue();
            if (actualMonth !== targetMonth) {
                console.warn(`Month select retry (got ${actualMonth}, expected ${targetMonth})...`);
                await newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first().selectOption(targetMonth);
                await waitStable();
            }

            // Aspetta che l'elemento del loading venga rimosso fisicamente dal DOM
            await newPage.locator('#rif_mbbody').waitFor({ state: 'detached' });
        }
    }

    console.log("Extracting timesheet data...");
    
    // Extract Header Info
    const companyInfo = await newPage.locator('[id$="_LblXCompanytbl"]').filter({ visible: true }).first().innerText();
    const employeeInfo = await newPage.locator('[id$="_LblXEmploytbl"]').filter({ visible: true }).first().innerText();
    const month = await newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first().inputValue();
    const year = await newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first().inputValue();

    const header = {
        company: companyInfo.trim(),
        employee: employeeInfo.trim(),
        period: { month, year }
    };

    // Helper to parse activity cells (giustificativi and richieste)
    const parseActivityCell = async (cell: any) => {
        const rows = await cell.locator('div.fakeRow').all();
        const activities: any[] = [];
        for (const rRow of rows) {
            const fullText = (await rRow.innerText()).trim().replace(/\s+/g, ' ');
            const statusSpan = rRow.locator('span[title]');
            let status = "";
            if (await statusSpan.count() > 0) {
                status = await statusSpan.first().getAttribute('title');
            }

            // Extract qta
            let text = fullText;
            let qta = "";
            
            // Pattern 1: "ACTIVITY q.tà 08:00" (Common in Richieste)
            const qtaMatch1 = fullText.match(/(.*?)\s*q\.\s*tà\s*([\d:]+)/i);
            // Pattern 2: "08:00ACTIVITY" (Common in Giustificativi)
            const qtaMatch2 = fullText.match(/^([\d:]+)\s*(.*)/);

            if (qtaMatch1) {
                text = qtaMatch1[1].trim();
                qta = qtaMatch1[2].trim();
            } else if (qtaMatch2) {
                qta = qtaMatch2[1].trim();
                text = qtaMatch2[2].trim();
            }
            
            if (text || qta) {
                const activity: any = {};
                if (text) activity.text = text;
                if (qta) activity.qta = qta;
                if (status) activity.status = status;
                activities.push(activity);
            }
        }
        return activities;
    };

    const rows = await newPage.locator('tr[id*="_Grid1_row"]').all();
    const timesheetData: any[] = [];

    for (const row of rows) {
        const cells = await row.locator('td').all();
        if (cells.length < 10) continue;

        // Date formatting: YYYY-MM-DD and dayOfWeek
        const dayStr = (await cells[0].innerText()).trim(); // e.g. "25 Mer"
        const dayMatch = dayStr.match(/^(\d+)\s+(.*)/);
        const dayNumber = dayMatch ? dayMatch[1].padStart(2, '0') : '01';
        const dayOfWeek = dayMatch ? dayMatch[2].trim() : '';
        const formattedDate = `${header.period.year}-${header.period.month.padStart(2, '0')}-${dayNumber}`;

        const timbrature = (await cells[3].innerText()).trim().replace(/\n/g, ' ');
        const giustificativi = await parseActivityCell(cells[4]);
        const richieste = await parseActivityCell(cells[5]);

        const orario = (await cells[7].innerText()).trim();
        const hOrd = (await cells[8].innerText()).trim();
        const hEcc = (await cells[9].innerText()).trim();

        timesheetData.push({
            date: formattedDate,
            dayOfWeek,
            timbrature,
            giustificativi,
            richieste,
            orario,
            hOrd,
            hEcc
        });
    }

    // Output JSON
    const timeToMinutes = (timeStr: string) => {
        if (!timeStr || !timeStr.includes(':')) return 0;
        const [h, m] = timeStr.split(':').map(Number);
        return (h || 0) * 60 + (m || 0);
    };

    const minutesToStr = (totalMinutes: number) => {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h}:${m.toString().padStart(2, '0')}`;
    };

    const validatedData = timesheetData.map(day => {
        const hOrdMinutes = timeToMinutes(day.hOrd);
        const EXCLUDED_FROM_HORD = ["FERIE", "SERVIZIO ESTERNO", "EX FESTIVITA'", "MALATTIA"];

        // Sum approved requests
        const approvedReqs = day.richieste.filter((r: any) => r.status === 'Approvata');
        
        // sumReqAll: All approved requests
        // sumReqHOrd: Approved requests NOT in the exclusion list
        let sumReqAll = 0;
        let sumReqHOrd = 0;
        approvedReqs.forEach((r: any) => {
            let qta = timeToMinutes(r.qta);
            if (qta === 0) {
                const match = day.giustificativi.find((g: any) => g.text === r.text);
                if (match) qta = timeToMinutes(match.qta);
            }
            sumReqAll += qta;
            if (!EXCLUDED_FROM_HORD.includes(r.text)) {
                sumReqHOrd += qta;
            }
        });

        // Sum justificatives
        // sumGiuAll: All justificatives
        // sumGiuHOrd: Justificatives NOT in the exclusion list
        let sumGiuAll = 0;
        let sumGiuHOrd = 0;
        day.giustificativi.forEach((g: any) => {
            const qta = timeToMinutes(g.qta);
            sumGiuAll += qta;
            if (!EXCLUDED_FROM_HORD.includes(g.text)) {
                sumGiuHOrd += qta;
            }
        });

        const warnings: string[] = [];

        // Check 1: approved hOrd-type requests vs hOrd
        if (sumReqHOrd > 0 && sumReqHOrd !== hOrdMinutes) {
            warnings.push(`Discrepanza: hOrd (${day.hOrd || '0:00'}) != somma richieste hOrd approvate (${minutesToStr(sumReqHOrd)})`);
        }

        // Check 2: hOrd-type justificatives vs hOrd
        if (sumGiuHOrd > 0 && sumGiuHOrd !== hOrdMinutes) {
            warnings.push(`Discrepanza: hOrd (${day.hOrd || '0:00'}) != somma giustificativi hOrd (${minutesToStr(sumGiuHOrd)})`);
        }

        // Check 3: total requests vs total justificatives (cross-check consistency)
        const sumReqConsistency = approvedReqs
            .filter((r: any) => r.text !== "MALATTIA")
            .reduce((acc: number, r: any) => {
                let qta = timeToMinutes(r.qta);
                if (qta === 0) {
                    const match = day.giustificativi.find((g: any) => g.text === r.text);
                    if (match) qta = timeToMinutes(match.qta);
                }
                return acc + qta;
            }, 0);

        const sumGiuConsistency = day.giustificativi
            .filter((g: any) => g.text !== "MALATTIA")
            .reduce((acc: number, g: any) => acc + timeToMinutes(g.qta), 0);

        if ((sumReqConsistency > 0 || sumGiuConsistency > 0) && sumReqConsistency !== sumGiuConsistency) {
            warnings.push(`Incongruenza: Somma richieste approvate (${minutesToStr(sumReqConsistency)}) != somma giustificativi (${minutesToStr(sumGiuConsistency)}) (escluso Malattia)`);
        }

        if (warnings.length > 0) {
            return { ...day, warnings };
        }
        return day;
    });

    console.log("--- START JSON ---");
    console.log(JSON.stringify({ header, days: validatedData }, null, 2));
    console.log("--- END JSON ---");

    await browser.close();
})();
