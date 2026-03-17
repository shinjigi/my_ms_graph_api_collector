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

const NIBOL_URL = process.env['NIBOL_URL'] ?? 'https://app.nibol.com';

export interface NibolBooking {
    date: string;
    type: string;
    details?: string;
}

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
    // URL expects YYYYMMDD
    const formattedDate = date.replace(/-/g, '');
    const profileDir = getProfileDir();
    const context    = await chromium.launchPersistentContext(profileDir, {
        headless:  false,
        slowMo:    500, // Slightly slower to be safer with UI interactions
        args:      ['--no-sandbox', '--start-maximized'],
    });

    const page = await context.newPage();
    try {
        console.log(`Navigating to home for date: ${formattedDate}`);
        await page.goto(`${NIBOL_URL}/home?day=${formattedDate}`, { waitUntil: 'networkidle' });

        if (await isLoginRequired(page)) {
            console.log('Sessione Nibol scaduta. Login manuale richiesto.');
            await page.waitForURL(url => !url.toString().includes('login') && !url.toString().includes('auth'), {
                timeout: 300_000,
            });
            // Re-navigate after login to ensure we are on the right day
            await page.goto(`${NIBOL_URL}/home?day=${formattedDate}`, { waitUntil: 'networkidle' });
        }

        // 1. Click "Select desk"
        console.log('Clicking "Select desk"...');
        const selectDeskBtn = page.locator('button').filter({ hasText: 'Select desk' });
        await selectDeskBtn.click();

        // 2. Click "plus" button twice (zoom in)
        console.log('Zooming in (x2)...');
        const plusBtn = page.locator('button.ant-btn-icon-only').filter({ has: page.locator('svg path[d*="M8.75 3V14.5"]') });
        if (await plusBtn.isVisible()) {
            await plusBtn.click();
            await page.waitForTimeout(1500);
            await plusBtn.click();
            await page.waitForTimeout(1500);
        }

        // 3. Find first available desk in range O13 to O36
        console.log('Searching for available desks O13-O36...');
        const pins = page.locator('div[class*="Floorplan_deskMarkerPin__"]');
        
        // Wait for pins to ensure the map loaded
        await pins.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => console.log("No pins visible yet..."));

        // Temporarily hide the sidebar and other overlays that might intercept hover/events
        console.log('Hiding overlays for map exploration...');
        const hideStyle = await page.addStyleTag({ 
            content: 'nav, aside, .ant-layout-sider, [class*="sidebar"], [class*="layout_sidebar"] { display: none !important; }'
        }).catch(() => null);

        const count = await pins.count();
        console.log(`Found ${count} total pins on map.`);
        
        let booked = false;

        for (let i = 0; i < count; i++) {
            const pin = pins.nth(i);
            
            try {
                // Ensure the pin is in the viewport to avoid "outside of viewport" errors
                await pin.scrollIntoViewIfNeeded().catch(() => {});
                
                // Trigger hover. If physical hover fails, we still proceed with dispatchEvent
                await pin.hover({ timeout: 1000, force: true }).catch(() => {});
                await pin.dispatchEvent('mouseover');
                await pin.dispatchEvent('mouseenter');
                
                // Wait for any dynamic changes
                await page.waitForTimeout(400); 

                let tooltipText: string | null = null;
                
                // Strategy A: Check if the pin itself has text content (e.g. <span> or text node inside)
                const internalText = await pin.textContent();
                if (internalText && internalText.trim().match(/O\d+/)) {
                    tooltipText = internalText.trim();
                }

                if (!tooltipText) {
                    // Strategy B: Linked tooltip via aria-describedby
                    const tooltipId = await pin.getAttribute('aria-describedby');
                    if (tooltipId) {
                        tooltipText = await page.locator(`#${tooltipId}`).textContent();
                    }
                }

                if (!tooltipText) {
                    // Strategy C: Generic visible tooltip
                    const genericTooltip = page.locator('.leaflet-tooltip, .ant-tooltip, .Floorplan_tooltip__').filter({ visible: true });
                    const tooltipCount = await genericTooltip.count();
                    if (tooltipCount > 0) {
                        tooltipText = await genericTooltip.last().textContent();
                    }
                }

                const cleanText = tooltipText?.trim() || "";
                if (cleanText) {
                    const match = cleanText.match(/O(\d+)/i);
                    console.log(`Pin ${i}: Text="${cleanText}"`);
                    
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num >= 13 && num <= 36) {
                            console.log(`  >>> Target desk found: ${cleanText}!`);
                            
                            // Restore UI before clicking
                            if (hideStyle) await hideStyle.evaluate(el => (el as any).remove()).catch(() => {});
                            
                            console.log(`  >>> Executing click...`);
                            await pin.click({ force: true });
                            booked = true;
                            break;
                        }
                    }
                } else {
                    console.log(`Pin ${i}: No text found.`);
                }
                
                await pin.dispatchEvent('mouseleave');
                await pin.dispatchEvent('mouseout');
            } catch (e) {
                console.warn(`Error inspecting pin ${i}:`, (e as Error).message);
            }
        }

        // Ensure overlays are restored if we haven't found a desk
        if (!booked && hideStyle) {
            await hideStyle.evaluate(el => (el as any).remove()).catch(() => {});
        }

        if (booked) {
            // 4. Click "Book" in the sidebar
            console.log('Clicking "Book" in sidebar...');
            const bookSidebarBtn = page.locator('button.ant-btn-primary').filter({ hasText: 'Book' });
            await bookSidebarBtn.click();
            console.log(`Nibol: desk prenotato per ${date}`);
            await page.waitForTimeout(2000); // Wait a bit for confirmation
        } else {
            console.warn(`Nibol: nessun desk disponibile nel range O13-O36 per ${date}`);
        }

    } catch (error) {
        console.error("An error occurred during booking:", error);
        await page.screenshot({ path: 'nibol_booking_error.png', fullPage: true });
        throw error;
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

export async function nibolFetchCalendarData(range?: { start: string, end: string }): Promise<NibolBooking[]> {
    const profileDir = getProfileDir();
    const context    = await chromium.launchPersistentContext(profileDir, {
        headless:  true,
        slowMo:    200,
        args:      ['--no-sandbox'],
    });

    const page = await context.newPage();

    try {
        await page.goto(`${NIBOL_URL}/calendar`, { waitUntil: 'networkidle' });

        if (await isLoginRequired(page)) {
             console.log('Sessione Nibol scaduta. Lancio browser visibile per login...');
             await page.waitForURL(url => !url.toString().includes('login') && !url.toString().includes('auth'), {
                 timeout: 60_000,
             });
        }

        const bookings: NibolBooking[] = [];
        
        await page.waitForSelector('.booking, [class*="Booking"]', { timeout: 10000 }).catch(() => {});

        const entries = await page.evaluate(() => {
            const list: any[] = [];
            const elements = document.querySelectorAll('.booking-item, .card-booking, [data-testid*="booking"]');
            elements.forEach(el => {
                const date = el.querySelector('.date, .time')?.textContent?.trim() || '';
                const title = el.querySelector('.title, .name')?.textContent?.trim() || '';
                if (date) list.push({ date, type: title });
            });
            return list;
        });

        return entries;

    } finally {
        await context.close();
    }
}
