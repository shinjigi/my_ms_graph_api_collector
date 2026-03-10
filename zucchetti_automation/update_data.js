const { chromium } = require('playwright');
const { parseArgs } = require('node:util');

const options = {
    date: { type: 'string' },
    type: { type: 'string', default: 'SMART WORKING' },
    'full-day': { type: 'boolean', default: false },
    hours: { type: 'string', default: '0' },
    minutes: { type: 'string', default: '0' },
};

const { values } = parseArgs({ options, args: process.argv.slice(2), strict: false });

const targetDate = values.date; // format YYYY-MM-DD
const activityType = values.type.trim().toUpperCase();
const isFullDay = values['full-day'];
const hours = values.hours;
const minutes = values.minutes;

// Zucchetti valid giustificativi mapped perfectly to the HTML options
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

if (!targetDate) {
    console.error("Error: Please provide a target date.");
    console.error("Usage: npm run zucchetti:update -- --date=YYYY-MM-DD [--full-day=true] [--type='SMART WORKING'] [--hours=4] [--minutes=30]");
    process.exit(1);
}

const matchedActivity = validActivities.find(a => a.toUpperCase().includes(activityType));
if (!matchedActivity) {
    console.error(`Error: Activity type "${activityType}" is not recognized.`);
    console.error(`Valid options are: \n${validActivities.join('\n')}`);
    process.exit(1);
}

(async () => {
    // 1. Launch browser
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to Zucchetti portal...");
    await page.goto('https://saas.hrzucchetti.it/hrpzcs01/jsp/home.jsp');

    // 2. Login
    console.log("Filling login credentials...");
    const username = process.env.ZUCCHETTI_USERNAME;
    const password = process.env.ZUCCHETTI_PASSWORD;

    if (!username || !password) {
        console.error("Error: ZUCCHETTI_USERNAME or ZUCCHETTI_PASSWORD not found in environment.");
        process.exit(1);
    }

    try {
        await page.waitForTimeout(2000);
        await page.waitForSelector('input[placeholder="Username"], input[name*="UserName"]', { state: 'visible', timeout: 30000 });
    } catch (error) {
        console.error("Could not find the login form! Taking a screenshot for debugging...");
        await page.screenshot({ path: 'login_error_debug.png', fullPage: true });
        throw error;
    }

    const usernameInput = page.locator('input[placeholder="Username"], input[name*="UserName"]').first();
    const passwordInput = page.locator('input[placeholder="Password"], input[type="password"]').first();
    const loginButton = page.locator('button:has-text("Login"), input[value="Login"], a:has-text("Login")').first();

    await usernameInput.fill(username);
    await passwordInput.fill(password);
    
    console.log("Clicking Login button...");
    await loginButton.click();

    // 3. Wait for post-login page
    console.log("Waiting for 'Servizi aggiuntivi' link to appear...");
    const serviziAggiuntiviSelector = 'a[title="Servizi aggiuntivi"]';
    
    try {
        await page.waitForSelector(serviziAggiuntiviSelector, { state: 'visible', timeout: 15000 });
    } catch (error) {
        console.error("Could not find 'Servizi aggiuntivi'! Check home_error_debug.png.");
        await page.screenshot({ path: 'home_error_debug.png', fullPage: true });
        throw error;
    }

    // 4. Click 'Servizi aggiuntivi'
    console.log("Clicking 'Servizi aggiuntivi'...");
    await page.click(serviziAggiuntiviSelector);

    // 5. Click "Cartellino Mensile"
    console.log("Clicking 'Cartellino Mensile'...");
    await page.getByText('Cartellino Mensile', { exact: false }).click();

    console.log("Waiting for new tab to open...");
    const newPagePromise = context.waitForEvent('page');
    const newPage = await newPagePromise;
    await newPage.waitForLoadState('networkidle');

    console.log("New tab opened! Navigated to HR-WorkFlow.");

    // 6. Click "Nuova richiesta" for target date
    console.log(`Clicking 'Nuova richiesta' for ${targetDate}...`);
    await newPage.locator(`span[title="Nuova richiesta"][onclick*="${targetDate}"]`).click();

    // 7. Wait for modal and select activity
    console.log("Waiting for the modal to fully load...");
    await newPage.waitForTimeout(4000); 

    console.log(`Selecting matched activity: "${matchedActivity}"...`);
    try {
        // Zucchetti often uses iframes for modals. Let's find the right frame.
        let targetFrame = newPage;
        const frames = newPage.frames();
        console.log(`Searching across ${frames.length} frames...`);

        const dropdownSelector = 'select[id$="_Combobox23"], select.Combobox23_ctrl';
        
        let dropdown = null;
        for (const frame of frames) {
            const found = frame.locator(dropdownSelector).first();
            if (await found.count() > 0) {
                console.log(`Found dropdown in frame: ${frame.url()}`);
                targetFrame = frame;
                dropdown = found;
                break;
            }
        }

        if (!dropdown) {
            console.log("Not found in any frame, trying main page...");
            dropdown = newPage.locator(dropdownSelector).first();
            await dropdown.waitFor({ state: 'attached', timeout: 5000 });
        }

        // Use the identified frame for subsequent actions (checkboxes, inputs)
        console.log(`Selecting ${matchedActivity} using frame/page...`);
        await dropdown.selectOption({ label: matchedActivity });
        console.log(`Selected ${matchedActivity}.`);
        
        // Zucchetti usually triggers a lot of JS. Wait for the page to settle.
        await targetFrame.waitForTimeout(3000);
        await newPage.screenshot({ path: 'after_selection_debug.png', fullPage: true });

        // 8. Handle duration
        console.log(`Handling duration in same frame: FullDay=${isFullDay}`);
        if (isFullDay) {
            console.log("Checking 'Giornata intera' box...");
            // Filter by visibility to avoid hitting hidden copies of the checkbox
            const fullDayCheckbox = targetFrame.locator('input[id$="_cPeriodoBox"], input[id$="_InteraBox"]').filter({ visible: true }).first();
            
            try {
                await fullDayCheckbox.waitFor({ state: 'visible', timeout: 5000 });
                await fullDayCheckbox.check({ force: true });
            } catch (e) {
                console.log("Direct check failed, trying to click by text 'Giornata intera'...");
                await targetFrame.locator('label:has-text("Giornata intera")').filter({ visible: true }).first().click({ force: true });
            }
        } else {
            console.log(`Setting time to ${hours}:${minutes}...`);
            const hoursInput = targetFrame.locator('input[id$="_qtahh"]').filter({ visible: true }).first();
            const minutesInput = targetFrame.locator('input[id$="_qtamm"]').filter({ visible: true }).first();
            
            await hoursInput.waitFor({ state: 'visible', timeout: 5000 });
            await hoursInput.fill(hours.toString(), { force: true });
            await minutesInput.fill(minutes.toString(), { force: true });
        }

        // 9. Click "Invia"
        console.log("Clicking Invia...");
        const inviaButton = targetFrame.locator('input[id$="_InvioButton"]').filter({ visible: true }).first();
        await inviaButton.waitFor({ state: 'visible', timeout: 5000 });
        await inviaButton.click({ force: true });

    } catch (error) {
        console.error(`Failed during modal interaction! Check dropdown_error_debug.png.`);
        await newPage.screenshot({ path: 'dropdown_error_debug.png', fullPage: true });
        throw error;
    }

    // 10. Verification
    console.log("Verifying submission...");
    try {
        // Wait for potential success message or for modal to close
        await newPage.waitForTimeout(3000);
        // Look for the activity text on the timesheet for verification
        await newPage.waitForSelector(`text=${matchedActivity}`, { state: 'visible', timeout: 15000 });
        console.log(`Success! "${matchedActivity}" verified on timesheet for ${targetDate}.`);
    } catch (error) {
        console.log("Verification timed out, but request might have been sent. Check the portal manually.");
        await newPage.screenshot({ path: 'verification_fyi.png', fullPage: true });
    }

    console.log("Completion achieved. Closing browser in 5 seconds...");
    await newPage.waitForTimeout(5000);
    await browser.close();
})();
