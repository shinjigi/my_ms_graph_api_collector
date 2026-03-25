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
                // Ensure the pin is in the viewport. 
                // Leaflet maps can't always be scrolled by standard Playwright methods.
                // We try a combine approach.
                await pin.scrollIntoViewIfNeeded().catch(() => {});
                
                const box = await pin.boundingBox();
                if (!box) {
                    console.log(`Pin ${i}: No bounding box, skipping.`);
                    continue;
                }

                console.log(`Pin ${i}: Position [${Math.round(box.x)}, ${Math.round(box.y)}]`);

                // Move mouse to pin and hover
                await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
                await pin.hover({ timeout: 1000, force: true }).catch(() => {});
                await pin.dispatchEvent('mouseover');
                await pin.dispatchEvent('mouseenter');
                
                await page.waitForTimeout(600); 

                let tooltipText: string | null = null;
                
                // Strategy A: Check if the pin itself has text content
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
                    // Strategy C: Closest visible tooltip
                    // Instead of just 'last()', find the one whose bounding box is closest to the pin
                    const possibleTooltips = page.locator('.leaflet-tooltip, .ant-tooltip, .Floorplan_tooltip__').filter({ visible: true });
                    const tCount = await possibleTooltips.count();
                    
                    if (tCount > 0) {
                        const closest = await page.evaluate(({px, py, sel}) => {
                            const tls = Array.from(document.querySelectorAll(sel)) as HTMLElement[];
                            let minData = { text: '', dist: Infinity };
                            tls.forEach(t => {
                                const r = t.getBoundingClientRect();
                                const dist = Math.sqrt(Math.pow(r.left - px, 2) + Math.pow(r.top - py, 2));
                                if (dist < minData.dist) {
                                    minData = { text: t.textContent?.trim() || '', dist };
                                }
                            });
                            return minData;
                        }, { px: box.x, py: box.y, sel: '.leaflet-tooltip, .ant-tooltip, [class*="Floorplan_tooltip"]' });
                        
                        if (closest.dist < 100) { // Only trust if relatively close
                            tooltipText = closest.text;
                        }
                    }
                }

                const cleanText = tooltipText?.trim() || "";
                if (cleanText) {
                    const match = cleanText.match(/O(\d+)/i);
                    console.log(`Pin ${i}: Detected="${cleanText}"`);
                    
                    if (match) {
                        const num = parseInt(match[1], 10);
                        if (num >= 13 && num <= 36) {
                            console.log(`  >>> Target desk found: ${cleanText}!`);
                            if (hideStyle) await hideStyle.evaluate(el => (el as any).remove()).catch(() => {});
                            console.log(`  >>> Executing click...`);
                            await pin.click({ force: true });
                            booked = true;
                            break;
                        }
                    }
                } else {
                    console.log(`Pin ${i}: No text detected.`);
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
    const userName   = process.env['NIBOL_USER_NAME'] || 'Luigi De Pinto';
    
    const context    = await chromium.launchPersistentContext(profileDir, {
        headless:  false,
        slowMo:    500,
        args:      ['--no-sandbox', '--start-maximized'],
    });

    const page = await context.newPage();

    try {
        console.log(`Navigating to calendar: ${NIBOL_URL}/calendar`);
        await page.goto(`${NIBOL_URL}/calendar`, { waitUntil: 'load', timeout: 60000 });

        if (await isLoginRequired(page)) {
            console.log('Sessione Nibol scaduta. Login manuale richiesto.');
            await page.waitForURL(url => !url.toString().includes('login') && !url.toString().includes('auth'), {
                timeout: 300_000,
            });
            await page.goto(`${NIBOL_URL}/calendar`, { waitUntil: 'load', timeout: 60000 });
        }

        const allBookings: NibolBooking[] = [];
        
        // Define target range
        const now = new Date();
        const start = range ? new Date(range.start) : new Date(process.env['COLLECT_SINCE'] ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
        const end = range ? new Date(range.end) : now;

        console.log(`Collection range: ${start.toISOString().slice(0, 7)} to ${end.toISOString().slice(0, 7)}`);

        // Helper to get current displayed month/year
        const getDisplayedPeriod = async () => {
            const periodText = await page.locator('h3').filter({ hasText: /202\d/ }).first().textContent().catch(() => '');
            if (periodText) {
                const match = periodText.match(/(\w+)\s+(\d{4})/);
                if (match) {
                    const monthName = match[1];
                    const year = parseInt(match[2], 10);
                    const date = new Date(`${monthName} 1, ${year}`);
                    return { month: date.getMonth(), year };
                }
            }
            return null;
        };

        // Navigation buttons
        const prevBtn = page.locator('button.ant-btn').filter({ has: page.locator('svg path[d="M18.5 12H6M6 12L12 6M6 12L12 18"]') });
        const nextBtn = page.locator('button.ant-btn').filter({ has: page.locator('svg path[d="M6 12H18.5M18.5 12L12.5 6M18.5 12L12.5 18"]') });

        // 1. Navigate to start month
        let displayed = await getDisplayedPeriod();
        if (!displayed) throw new Error("Could not detect displayed period on Nibol calendar");

        let displayedDate = new Date(displayed.year, displayed.month, 1);
        let startDate     = new Date(start.getFullYear(), start.getMonth(), 1);
        let endDate       = new Date(end.getFullYear(), end.getMonth(), 1);

        console.log(`Currently at ${displayedDate.toISOString().slice(0, 7)}, moving to ${startDate.toISOString().slice(0, 7)}...`);

        while (displayedDate.getTime() > startDate.getTime()) {
            await prevBtn.click();
            await page.waitForTimeout(1000);
            displayed = await getDisplayedPeriod();
            if (!displayed) break;
            displayedDate = new Date(displayed.year, displayed.month, 1);
        }
        while (displayedDate.getTime() < startDate.getTime()) {
            await nextBtn.click();
            await page.waitForTimeout(1000);
            displayed = await getDisplayedPeriod();
            if (!displayed) break;
            displayedDate = new Date(displayed.year, displayed.month, 1);
        }

        // 2. Iterate through months until end
        while (displayedDate.getTime() <= endDate.getTime()) {
            console.log(`Collecting data for ${displayedDate.toISOString().slice(0, 7)}...`);
            
            await page.waitForSelector('table, .CalendarTable_container__1hJ2Y', { timeout: 30000 }).catch(() => console.log('Table not found, proceeding anyway...'));
            await page.waitForTimeout(4000); // Increased to 4s to ensure data reload

            const monthBookings = await page.evaluate(({month, year, targetName}) => {
                const list: any[] = [];
                const rows = Array.from(document.querySelectorAll('tr'));
                const myRow = rows.find(r => 
                    r.textContent?.includes('(You)') || 
                    r.textContent?.toLowerCase().includes(targetName.toLowerCase())
                );
                if (!myRow) return [];

                const headers = Array.from(document.querySelectorAll('thead th'));
                const dayHeaders = headers.map(h => {
                    const span = h.querySelector('span');
                    const dayMatch = (span?.textContent || h.textContent)?.trim().match(/^(\d+)$/);
                    return dayMatch ? parseInt(dayMatch[1], 10) : null;
                });
                
                const cells = Array.from(myRow.querySelectorAll('td'));
                cells.forEach((cell, idx) => {
                    const day = dayHeaders[idx];
                    if (!day) return;
                    let type: string | null = null;
                    if (cell.classList.contains('office') || cell.querySelector('span[style*="rgb(22, 119, 255)"]')) {
                        type = 'Office';
                    } else if (cell.classList.contains('remote') || cell.querySelector('span[style*="rgb(250, 173, 20)"]')) {
                        type = 'Remote';
                    }
                    if (type) {
                        const monthStr = String(month + 1).padStart(2, '0');
                        const dayStr = String(day).padStart(2, '0');
                        list.push({ 
                            date: `${year}-${monthStr}-${dayStr}`,
                            type: type,
                            details: `Detected as ${type} in grid`
                        });
                    }
                });
                return list;
            }, { month: displayedDate.getMonth(), year: displayedDate.getFullYear(), targetName: userName });

            allBookings.push(...monthBookings);

            // Move to next month
            await nextBtn.click();
            await page.waitForTimeout(1000);
            displayed = await getDisplayedPeriod();
            if (!displayed) break;
            displayedDate = new Date(displayed.year, displayed.month, 1);
        }

        // Final filtering by exact dates
        const filtered = allBookings.filter(b => {
            const bDate = new Date(b.date);
            return bDate >= start && bDate <= end;
        });

        return filtered;

    } catch (error) {
        console.error("Error fetching calendar data:", error);
        return [];
    } finally {
        await context.close();
    }
}

export async function collectNibol(force = false, range?: { start: string, end: string }): Promise<string[]> {
    const NIBOL_DIR = path.join(process.cwd(), 'data', 'raw', 'nibol');
    const fs = require('fs/promises');
    
    console.log('[Nibol] starting collection...');
    await fs.mkdir(NIBOL_DIR, { recursive: true });

    const now = new Date();
    const effectiveRange = range ?? {
        start: process.env['COLLECT_SINCE'] ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`,
        end:   now.toISOString().slice(0, 10)
    };

    const bookings = await nibolFetchCalendarData(effectiveRange);
    
    // Group by month
    const grouped: Record<string, NibolBooking[]> = {};
    for (const b of bookings) {
        const monthStr = b.date.slice(0, 7);
        if (!grouped[monthStr]) grouped[monthStr] = [];
        grouped[monthStr].push(b);
    }

    const outPaths: string[] = [];
    for (const [monthStr, monthBookings] of Object.entries(grouped)) {
        const outPath = path.join(NIBOL_DIR, `${monthStr}.json`);
        await fs.writeFile(outPath, JSON.stringify(monthBookings, null, 2), 'utf-8');
        outPaths.push(outPath);
        console.log(`  Nibol: ${monthStr} -> ${outPath}`);
    }

    return outPaths;
}
