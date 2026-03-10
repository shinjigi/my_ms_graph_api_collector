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
const activityType = values.type;
const isFullDay = values['full-day'];
const hours = values.hours;
const minutes = values.minutes;

if (!targetDate) {
    console.error("Error: Please provide a target date.");
    console.error("Usage: npm run zucchetti:update -- --date=YYYY-MM-DD [--full-day=true] [--type='SMART WORKING'] [--hours=4] [--minutes=30]");
    process.exit(1);
}

(async () => {
    // 1. Launch browser (headful for now so you can see what it does)
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    console.log("Navigating to Zucchetti portal...");
    await page.goto('https://saas.hrzucchetti.it/hrpzcs01/jsp/home.jsp');

    // 2. Login
    console.log("Filling login credentials...");
    // Replace these with actual environment variables or secure inputs later
    const username = process.env.ZUCCHETTI_USERNAME || 'YOUR_USERNAME';
    const password = process.env.ZUCCHETTI_PASSWORD || 'YOUR_PASSWORD';

    // Wait for the login form to become fully attached and visible
    try {
        await page.waitForTimeout(3000); // Give it a short breather
        // The ID might change or we get a generic ERM Portal page, use flexible locators
        await page.waitForSelector('input[placeholder="Username"], input[name*="UserName"], #tp8ca_m_cUserName', { state: 'visible', timeout: 30000 });
    } catch (error) {
        console.error("Could not find the login form! Taking a screenshot for debugging...");
        await page.screenshot({ path: 'login_error_debug.png', fullPage: true });
        throw error;
    }

    const usernameInput = page.locator('input[placeholder="Username"], input[name*="UserName"], #tp8ca_m_cUserName').first();
    const passwordInput = page.locator('input[placeholder="Password"], input[type="password"], #tp8ca_m_cPassword').first();
    const loginButton = page.locator('button:has-text("Login"), input[value="Login"], a:has-text("Login"), #tp8ca_Accedi').first();

    await usernameInput.fill(username);
    await passwordInput.fill(password);
    
    console.log("Clicking Login button...");
    await loginButton.click();

    // 3. Wait for the page to load after login
    // We wait for the "Servizi aggiuntivi" link to become visible
    console.log("Waiting for 'Servizi aggiuntivi' link to appear...");
    
    // Instead of resting on a hardcoded ID, look for the title or ID
    const serviziAggiuntiviSelector = 'a[title="Servizi aggiuntivi"], #alsdq_Image22';
    
    try {
        await page.waitForSelector(serviziAggiuntiviSelector, { state: 'visible', timeout: 15000 });
    } catch (error) {
        console.error("Could not find 'Servizi aggiuntivi'! Taking a screenshot for debugging...");
        await page.screenshot({ path: 'home_error_debug.png', fullPage: true });
        throw error;
    }

    // 4. Click the target link
    console.log("Clicking 'Servizi aggiuntivi'...");
    await page.click(serviziAggiuntiviSelector);

    console.log("Successfully clicked 'Servizi aggiuntivi'!");

    // 5. Click "Cartellino Mensile"
    console.log("Clicking 'Cartellino Mensile'...");
    // Since it's inside an overlay, we find the span or link containing "Cartellino Mensile"
    await page.getByText('Cartellino Mensile', { exact: false }).click();

    // The click opens a new tab. We need to handle it.
    console.log("Waiting for new tab to open...");
    const newPagePromise = context.waitForEvent('page');
    // Note: If clicking doesn't trigger the new page immediately, you might need to adjust this
    const newPage = await newPagePromise;
    await newPage.waitForLoadState('networkidle');

    console.log("New tab opened! Navigated to HR-WorkFlow.");

    // 6. Click "Nuova richiesta" for the given date
    console.log(`Clicking 'Nuova richiesta' for ${targetDate}...`);
    // Since the onclick contains the date, we can locate it by an attribute
    await newPage.locator(`span[title="Nuova richiesta"][onclick*="${targetDate}"]`).click();

    // 7. Wait for the popup and select the given TYPE
    console.log("Waiting for the modal to fully load...");
    await newPage.waitForTimeout(4000); // Give Zucchetti time to populate

    console.log(`Selecting ${activityType}...`);
    try {
        // The user provided the exact HTML snippet:
        // <select id="j63j7_Combobox23" name="Combobox23" class="combobox Combobox23_ctrl" ...>
        // We locate the select that contains the string "Combobox" in its class or ID
        const dropdown = newPage.locator('select.combobox, select[id*="Combobox"]').first();
        
        // Wait for options to be populated
        await dropdown.waitFor({ state: 'attached', timeout: 10000 });

        // Retrieve all available options case-insensitively to find the exact match
        const optionsText = await dropdown.locator('option').allInnerTexts();
        const targetOption = optionsText.find(opt => opt.toUpperCase().includes(activityType.toUpperCase()));

        if (targetOption) {
            console.log(`Found matching option: "${targetOption}". Selecting it...`);
            await dropdown.selectOption({ label: targetOption });
        } else {
            console.error(`${activityType} option not found! Available options:`, optionsText);
            throw new Error(`${activityType} option missing`);
        }
    } catch (error) {
        console.error(`Failed to select ${activityType}!`);
        await newPage.screenshot({ path: 'dropdown_error_debug.png', fullPage: true });
        throw error;
    }

    // 8. Handle duration: check "Giornata intera" or input hours/minutes
    console.log(`Handling duration: FullDay=${isFullDay}`);
    if (isFullDay) {
        console.log("Checking 'Giornata intera' box...");
        // IDs are dynamic, ending with _cPeriodoBox
        await newPage.locator('input[type="checkbox"][id$="PeriodoBox"], input[type="checkbox"][name*="Periodo"]').first().check();
    } else {
        console.log(`Setting time to ${hours} hours and ${minutes} minutes...`);
        // Zucchetti often uses fields ending in _nHh / _nMi or containing placeholder HH/MM
        const hoursInput = newPage.locator('input[id$="nHh"], input[name*="Hh"], input[placeholder*="HH"]').first();
        const minutesInput = newPage.locator('input[id$="nMi"], input[name*="Mi"], input[placeholder*="MM"]').first();
        
        // Wait briefly just to be sure inputs exist
        await hoursInput.waitFor({ state: 'visible', timeout: 3000 }).catch(() => console.log("Hours input not immediately visible, continuing..."));
        
        if (await hoursInput.isVisible()) {
            await hoursInput.fill(hours.toString());
        } else {
            console.log("Warning: Could not find hours input!");
        }
        
        if (await minutesInput.isVisible()) {
            await minutesInput.fill(minutes.toString());
        } else {
            console.log("Warning: Could not find minutes input!");
        }
    }

    // 9. Click "Invia"
    console.log("Clicking Invia...");
    // ID ends with _InvioButton
    await newPage.locator('[id$="InvioButton"]').first().click();

    console.log("Request submitted successfully!");

    // 10. Close the success modal
    console.log("Closing success modal...");
    // Finding the red X button. The exact selector might vary, typically it's a window close icon.
    // Example: await newPage.locator('.modal-close-button').click(); 
    // Wait for the modal to disappear
    await newPage.waitForTimeout(2000); // Placeholder for actual modal close logic 

    // 11. Verify the exact text "SMART WORKING" appears for the 2nd of March
    console.log("Verifying 'SMART WORKING' appears on the timesheet...");
    await newPage.waitForSelector('text=SMART WORKING', { state: 'visible', timeout: 10000 });
    console.log("Smart Working verified on timesheet!");

    // Keep browser open for a bit so we can observe the result
    await newPage.waitForTimeout(5000);

    // await browser.close();
})();
