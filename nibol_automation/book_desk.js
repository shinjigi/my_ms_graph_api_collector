const { chromium } = require('playwright');
const path = require('path');

(async () => {
    // We use a persistent context to save login sessions and avoid MFA every time
    const userDataDir = path.join(__dirname, '.nibol_user_data');
    
    console.log("Launching browser with persistent context...");
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false, // Visible to handle MFA if needed
        args: ['--start-maximized']
    });

    const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    try {
        console.log("Navigating to Nibol login...");
        await page.goto('https://app.nibol.com/login');

        // Check if already logged in by looking for a dashboard element
        // If not, click Microsoft Login
        const microsoftSsoButton = page.locator("//span[text()='Login with Microsoft']/ancestor::button");
        
        if (await microsoftSsoButton.isVisible({ timeout: 5000 })) {
            console.log("Clicking 'Login with Microsoft'...");
            await microsoftSsoButton.click();
            
            console.log("Waiting for authentication... Please handle MFA in the browser if requested.");
            // Wait for navigation to the main dashboard or a known post-login element
            // Adjust the selector based on what appears after login (e.g., "Prenota scrivania" button)
            await page.waitForURL('**/dashboard/**', { timeout: 120000 });
            console.log("Login successful!");
        } else {
            console.log("Microsoft button not found, checking if already logged in...");
            if (page.url().includes('dashboard')) {
                console.log("Already logged in.");
            } else {
                console.log("Neither login button nor dashboard found. Current URL: " + page.url());
            }
        }

        // --- NAVIGATION TO DESK BOOKING ---
        console.log("Navigating to Desk booking...");
        // This is a placeholder for the actual navigation logic
        // We'll refine this after the user successfully logs in and we can see the dashboard
        
        console.log("Waiting for manual exploration of the dashboard...");
        await page.waitForTimeout(5000); 

    } catch (error) {
        console.error("An error occurred:", error);
        await page.screenshot({ path: 'nibol_error.png' });
    }

    // Keep the browser open for exploration if needed, or close it
    // await context.close();
})();
