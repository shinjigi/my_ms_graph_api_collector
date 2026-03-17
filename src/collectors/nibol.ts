/**
 * Nibol automation — persistent Playwright session.
 *
 * First run (headful): the user logs in manually; the session is persisted under
 * NIBOL_PROFILE_DIR. Subsequent runs are headless.
 *
 * If the SSO redirect is detected, the browser is made visible so the user can
 * re-authenticate, after which the session is persisted again.
 */
import * as path from 'path';
import { chromium } from 'playwright';

const NIBOL_URL = 'https://app.nibol.co';

function getProfileDir(): string {
    const dir = process.env['NIBOL_PROFILE_DIR'];
    if (!dir) {
        throw new Error('NIBOL_PROFILE_DIR non configurato in .env');
    }
    return dir;
}

async function isLoginRequired(page: import('playwright').Page): Promise<boolean> {
    const url = page.url();
    return url.includes('login') || url.includes('auth') || url.includes('sso');
}

export async function nibolBookDesk(date: string): Promise<void> {
    const profileDir = getProfileDir();
    const context    = await chromium.launchPersistentContext(profileDir, {
        headless:  false,
        slowMo:    200,
        args:      ['--no-sandbox'],
    });

    const page = await context.newPage();

    try {
        await page.goto(`${NIBOL_URL}/book`, { waitUntil: 'networkidle' });

        if (await isLoginRequired(page)) {
            console.log('Sessione Nibol scaduta. Login manuale richiesto. Chiudi il browser al termine.');
            // Wait for the user to complete manual login (up to 5 minutes)
            await page.waitForURL(url => !url.toString().includes('login') && !url.toString().includes('auth'), {
                timeout: 300_000,
            });
        }

        // Select the target date and book
        // The exact selectors depend on Nibol's UI — adapt as needed
        const dateInput = page.getByLabel('Data');
        if (await dateInput.isVisible()) {
            await dateInput.fill(date);
        }

        const bookButton = page.getByRole('button', { name: /prenota|book/i });
        if (await bookButton.isVisible()) {
            await bookButton.click();
            await page.waitForLoadState('networkidle');
            console.log(`Nibol: desk prenotato per ${date}`);
        } else {
            console.warn(`Nibol: pulsante prenota non trovato per ${date}`);
        }
    } finally {
        await context.close();
    }
}

export async function nibolCheckIn(date: string): Promise<void> {
    const profileDir = getProfileDir();
    const context    = await chromium.launchPersistentContext(profileDir, {
        headless: false,
        slowMo:   200,
        args:     ['--no-sandbox'],
    });

    const page = await context.newPage();

    try {
        await page.goto(`${NIBOL_URL}/checkin`, { waitUntil: 'networkidle' });

        if (await isLoginRequired(page)) {
            console.log('Sessione Nibol scaduta. Login manuale richiesto. Chiudi il browser al termine.');
            await page.waitForURL(url => !url.toString().includes('login') && !url.toString().includes('auth'), {
                timeout: 300_000,
            });
        }

        const checkInButton = page.getByRole('button', { name: /check.?in/i });
        if (await checkInButton.isVisible()) {
            await checkInButton.click();
            await page.waitForLoadState('networkidle');
            console.log(`Nibol: check-in effettuato per ${date}`);
        } else {
            console.warn(`Nibol: pulsante check-in non trovato per ${date}`);
        }
    } finally {
        await context.close();
    }
}
