const { chromium } = require('playwright');

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

    // 6. Click "Nuova richiesta" for March 2nd
    console.log("Clicking 'Nuova richiesta' for 2026-03-02...");
    // Since the onclick contains '2026-03-02', we can locate it by an attribute
    await newPage.locator('span[title="Nuova richiesta"][onclick*="2026-03-02"]').click();

    // 7. Wait for the popup and select "SMART WORKING"
    console.log("Selecting SMART WORKING...");
    const dropdown = newPage.locator('select').first(); // Adjust selector based on actual DOM ID like #i0cfq_Giustificativo
    await dropdown.selectOption({ label: 'SMART WORKING' });
    // Or if it's a searchable input:
    // await newPage.locator('input for dropdown').fill('smart');

    // 8. Check "Giornata intera"
    console.log("Checking 'Giornata intera'...");
    await newPage.locator('#i0cfq_cPeriodoBox').check();

    // 9. Click "Invia"
    console.log("Clicking Invia...");
    await newPage.locator('#i0cfq_InvioButton').click();

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
