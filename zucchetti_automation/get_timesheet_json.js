const { chromium } = require('playwright');
const { parseArgs } = require('node:util');

// Reusing same options for consistency
const options = {
    date: { type: 'string' }, // YYYY-MM-DD to identify the month
    month: { type: 'string' }, // 1-12
    year: { type: 'string' },  // YYYY
};

const { values } = parseArgs({ options, args: process.argv.slice(2), strict: false });

let targetMonth = values.month;
let targetYear = values.year;

// If date is provided, extract month and year from it
if (values.date) {
    const d = new Date(values.date);
    if (!isNaN(d.getTime())) {
        targetMonth = (d.getMonth() + 1).toString();
        targetYear = d.getFullYear().toString();
    }
}

(async () => {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

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
    await page.locator('button:has-text("Login"), input[value="Login"], a:has-text("Login")').first().click();

    // Navigate to Cartellino
    await page.waitForSelector('a[title="Servizi aggiuntivi"]', { state: 'visible', timeout: 30000 });
    await page.click('a[title="Servizi aggiuntivi"]');
    await page.getByText('Cartellino Mensile', { exact: false }).click();

    const [newPage] = await Promise.all([
        context.waitForEvent('page', { timeout: 90000 }),
    ]);
    await newPage.waitForLoadState('networkidle');

    // Select target Month/Year if provided
    if (targetMonth || targetYear) {
        console.log(`Setting target period to ${targetMonth}/${targetYear}...`);
        
        if (targetYear) {
            console.log("Selecting Year...");
            const yearSelect = newPage.locator('select[id$="_TxtAnno"]').filter({ visible: true }).first();
            await yearSelect.selectOption(targetYear);
            await newPage.waitForLoadState('networkidle');
            await newPage.waitForTimeout(2000); // Wait for Zucchetti reload
        }

        if (targetMonth) {
            console.log("Selecting Month...");
            const monthSelect = newPage.locator('select[id$="_TxtMese"]').filter({ visible: true }).first();
            await monthSelect.selectOption(targetMonth);
            await newPage.waitForLoadState('networkidle');
            await newPage.waitForTimeout(2000); // Wait for Zucchetti reload
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
    const parseActivityCell = async (cell) => {
        const rows = await cell.locator('div.fakeRow').all();
        const activities = [];
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
                const activity = {};
                if (text) activity.text = text;
                if (qta) activity.qta = qta;
                if (status) activity.status = status;
                activities.push(activity);
            }
        }
        return activities;
    };

    const rows = await newPage.locator('tr[id*="_Grid1_row"]').all();
    const timesheetData = [];

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
    console.log("--- START JSON ---");
    console.log(JSON.stringify({ header, days: timesheetData }, null, 2));
    console.log("--- END JSON ---");

    await browser.close();
})();
