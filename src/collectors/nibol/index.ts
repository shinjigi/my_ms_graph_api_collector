/**
 * Nibol automation — persistent Playwright session.
 *
 * First run (headful): the user logs in manually; the session is persisted under
 * NIBOL_PROFILE_DIR. Subsequent runs are headless.
 *
 * If the SSO redirect is detected, the browser is made visible so the user can
 * re-authenticate, after which the session is persisted again.
 */
import path from "node:path";
import * as nodeFs from "node:fs/promises";
import { chromium } from "playwright";
import { readMeta, writeMeta, shouldSkipMonth } from "../utils";
import type { NibolBooking } from "@shared/aggregator";

export type { NibolBooking };

const NIBOL_URL = process.env["NIBOL_URL"] ?? "https://app.nibol.com";

function getProfileDir(): string {
  const dir = process.env["NIBOL_PROFILE_DIR"];
  if (!dir) {
    throw new Error("NIBOL_PROFILE_DIR non configurato in .env");
  }
  return dir;
}

async function isLoginRequired(
  page: import("playwright").Page,
): Promise<boolean> {
  const url = page.url();
  return url.includes("login") || url.includes("auth") || url.includes("sso");
}

export async function nibolBookDesk(date: string): Promise<void> {
  // URL expects YYYYMMDD
  const formattedDate = date.replaceAll("-", "");
  const profileDir = getProfileDir();
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    slowMo: 500, // Slightly slower to be safer with UI interactions
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await context.newPage();
  try {
    console.log(`Navigating to home for date: ${formattedDate}`);
    await page.goto(`${NIBOL_URL}/home?day=${formattedDate}`, {
      waitUntil: "networkidle",
    });

    if (await isLoginRequired(page)) {
      console.log("Sessione Nibol scaduta. Login manuale richiesto.");
      await page.waitForURL(
        (url) =>
          !url.toString().includes("login") && !url.toString().includes("auth"),
        {
          timeout: 300_000,
        },
      );
      // Re-navigate after login to ensure we are on the right day
      await page.goto(`${NIBOL_URL}/home?day=${formattedDate}`, {
        waitUntil: "networkidle",
      });
    }

    // 1. Click "Select desk"
    console.log('Clicking "Select desk"...');
    const selectDeskBtn = page
      .locator("button")
      .filter({ hasText: "Select desk" });
    await selectDeskBtn.click();

    // 2. Click "plus" button twice (zoom in)
    console.log("Zooming in (x2)...");
    const plusBtn = page
      .locator("button.ant-btn-icon-only")
      .filter({ has: page.locator('svg path[d*="M8.75 3V14.5"]') });
    if (await plusBtn.isVisible()) {
      await plusBtn.click();
      await page.waitForTimeout(1500);
      await plusBtn.click();
      await page.waitForTimeout(1500);
    }

    // 3. Find first available desk in range O13 to O36
    console.log("Searching for available desks O13-O36...");
    const pins = page.locator('div[class*="Floorplan_deskMarkerPin__"]');

    // Wait for pins to ensure the map loaded
    await pins
      .first()
      .waitFor({ state: "visible", timeout: 10000 })
      .catch(() => console.log("No pins visible yet..."));

    // Temporarily hide the sidebar and other overlays that might intercept hover/events
    console.log("Hiding overlays for map exploration...");
    const hideStyle = await page
      .addStyleTag({
        content:
          'nav, aside, .ant-layout-sider, [class*="sidebar"], [class*="layout_sidebar"] { display: none !important; }',
      })
      .catch(() => null);

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

        console.log(
          `Pin ${i}: Position [${Math.round(box.x)}, ${Math.round(box.y)}]`,
        );

        // Move mouse to pin and hover
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await pin.hover({ timeout: 1000, force: true }).catch(() => {});
        await pin.dispatchEvent("mouseover");
        await pin.dispatchEvent("mouseenter");

        await page.waitForTimeout(600);

        let tooltipText: string | null = null;

        // Strategy A: Check if the pin itself has text content
        const internalText = await pin.textContent();
        if (internalText?.trim().match(/O\d+/)) {
          tooltipText = internalText.trim();
        }

        if (!tooltipText) {
          // Strategy B: Linked tooltip via aria-describedby
          const tooltipId = await pin.getAttribute("aria-describedby");
          if (tooltipId) {
            tooltipText = await page.locator(`#${tooltipId}`).textContent();
          }
        }

        if (!tooltipText) {
          // Strategy C: Closest visible tooltip
          // Instead of just 'last()', find the one whose bounding box is closest to the pin
          const possibleTooltips = page
            .locator(".leaflet-tooltip, .ant-tooltip, .Floorplan_tooltip__")
            .filter({ visible: true });
          const tCount = await possibleTooltips.count();

          if (tCount > 0) {
            const closest = await page.evaluate(
              ({ px, py, sel }) => {
                const tls = Array.from(document.querySelectorAll(sel));
                let minData = { text: "", dist: Infinity };
                tls.forEach((t) => {
                  const r = t.getBoundingClientRect();
                  const dist = Math.sqrt(
                    Math.pow(r.left - px, 2) + Math.pow(r.top - py, 2),
                  );
                  if (dist < minData.dist) {
                    minData = { text: t.textContent?.trim() || "", dist };
                  }
                });
                return minData;
              },
              {
                px: box.x,
                py: box.y,
                sel: '.leaflet-tooltip, .ant-tooltip, [class*="Floorplan_tooltip"]',
              },
            );

            if (closest.dist < 100) {
              // Only trust if relatively close
              tooltipText = closest.text;
            }
          }
        }

        const cleanText = tooltipText?.trim() || "";
        if (cleanText) {
          const match = new RegExp(/O(\d+)/i).exec(cleanText);
          console.log(`Pin ${i}: Detected="${cleanText}"`);

          if (match) {
            const num = Number.parseInt(match[1], 10);
            if (num >= 13 && num <= 36) {
              console.log(`  >>> Target desk found: ${cleanText}!`);
              if (hideStyle)
                await hideStyle
                  .evaluate((el) => (el as Element).remove())
                  .catch(() => {});
              console.log(`  >>> Executing click...`);
              await pin.click({ force: true });
              booked = true;
              break;
            }
          }
        } else {
          console.log(`Pin ${i}: No text detected.`);
        }

        await pin.dispatchEvent("mouseleave");
        await pin.dispatchEvent("mouseout");
      } catch (e) {
        console.warn(`Error inspecting pin ${i}:`, (e as Error).message);
      }
    }

    // Ensure overlays are restored if we haven't found a desk
    if (!booked && hideStyle) {
      await hideStyle
        .evaluate((el) => (el as Element).remove())
        .catch(() => {});
    }

    if (booked) {
      // 4. Click "Book" in the sidebar
      console.log('Clicking "Book" in sidebar...');
      const bookSidebarBtn = page
        .locator("button.ant-btn-primary")
        .filter({ hasText: "Book" });
      await bookSidebarBtn.click();
      console.log(`Nibol: desk prenotato per ${date}`);
      await page.waitForTimeout(2000); // Wait a bit for confirmation
    } else {
      console.warn(
        `Nibol: nessun desk disponibile nel range O13-O36 per ${date}`,
      );
    }
  } catch (error) {
    console.error("An error occurred during booking:", error);
    await page.screenshot({ path: "nibol_booking_error.png", fullPage: true });
    throw error;
  } finally {
    await context.close();
  }
}

export async function nibolCheckIn(date: string): Promise<void> {
  const profileDir = getProfileDir();
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    slowMo: 200,
    args: ["--no-sandbox"],
  });

  const page = await context.newPage();

  try {
    await page.goto(`${NIBOL_URL}/checkin`, { waitUntil: "networkidle" });

    if (await isLoginRequired(page)) {
      console.log(
        "Sessione Nibol scaduta. Login manuale richiesto. Chiudi il browser al termine.",
      );
      await page.waitForURL(
        (url) =>
          !url.toString().includes("login") && !url.toString().includes("auth"),
        {
          timeout: 300_000,
        },
      );
    }

    const checkInButton = page.getByRole("button", { name: /check.?in/i });
    if (await checkInButton.isVisible()) {
      await checkInButton.click();
      await page.waitForLoadState("networkidle");
      console.log(`Nibol: check-in effettuato per ${date}`);
    } else {
      console.warn(`Nibol: pulsante check-in non trovato per ${date}`);
    }
  } finally {
    await context.close();
  }
}

export async function nibolFetchCalendarData(range?: {
  start: string;
  end: string;
}): Promise<NibolBooking[]> {
  const profileDir = getProfileDir();
  const userName = process.env["NIBOL_USER_NAME"] || "Luigi De Pinto";

  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    slowMo: 500,
    args: ["--no-sandbox", "--start-maximized"],
  });

  const page = await context.newPage();

  try {
    // If range.start is provided, we could try to navigate to that specific month
    // For now, we assume the default view or the user will navigate if needed.
    // We navigate to /calendar which usually shows the current month.
    console.log(`Navigating to calendar: ${NIBOL_URL}/calendar`);
    await page.goto(`${NIBOL_URL}/calendar`, {
      waitUntil: "load",
      timeout: 60000,
    });

    if (await isLoginRequired(page)) {
      console.log("Sessione Nibol scaduta. Login manuale richiesto.");
      await page.waitForURL(
        (url) =>
          !url.toString().includes("login") && !url.toString().includes("auth"),
        {
          timeout: 300_000,
        },
      );
      await page.goto(`${NIBOL_URL}/calendar`, {
        waitUntil: "load",
        timeout: 60000,
      });
    }

    console.log("Waiting for bookings grid to load...");
    await page
      .waitForSelector("table, .CalendarTable_container__1hJ2Y", {
        timeout: 30000,
      })
      .catch(() => console.log("Table not found, proceeding anyway..."));
    await page.waitForTimeout(3000);

    await page.screenshot({ path: "data/calendar_debug.png", fullPage: true });

    async function getVisibleMonthYear() {
      const periodText = await page
        .locator("h3")
        .filter({ hasText: /202\d/ })
        .first()
        .textContent()
        .catch(() => "");
      console.log("Detected Period:", periodText);

      if (periodText) {
        const match = periodText.match(/(\w+)\s+(\d{4})/);
        if (match) {
          const monthName = match[1];
          const year = Number.parseInt(match[2], 10);
          const date = new Date(`${monthName} 1, ${year}`);
          if (!isNaN(date.getTime())) {
            return { month: date.getMonth(), year };
          }
        }
      }
      return { month: new Date().getMonth(), year: new Date().getFullYear() };
    }

    const { month: startMonth, year: startYear } = range
      ? {
          month: new Date(range.start).getMonth(),
          year: new Date(range.start).getFullYear(),
        }
      : { month: new Date().getMonth(), year: new Date().getFullYear() };

    const { month: endMonth, year: endYear } = range
      ? {
          month: new Date(range.end).getMonth(),
          year: new Date(range.end).getFullYear(),
        }
      : { month: new Date().getMonth(), year: new Date().getFullYear() };

    // Navigate to the start month
    let current = await getVisibleMonthYear();
    console.log(
      `Current visible: ${current.month + 1}/${current.year}, Target start: ${startMonth + 1}/${startYear}`,
    );

    // Navigate backward if needed
    while (
      current.year > startYear ||
      (current.year === startYear && current.month > startMonth)
    ) {
      console.log("Navigating to previous month...");
      await page
        .locator('button.ant-btn-icon-only:has(svg path[d^="M18.5 12H6"])')
        .click();
      await page.waitForTimeout(2000);
      current = await getVisibleMonthYear();
    }

    // Navigate forward if needed
    while (
      current.year < startYear ||
      (current.year === startYear && current.month < startMonth)
    ) {
      console.log("Navigating to next month...");
      await page
        .locator('button.ant-btn-icon-only:has(svg path[d^="M6 12H18.5"])')
        .click();
      await page.waitForTimeout(2000);
      current = await getVisibleMonthYear();
    }

    const allBookings: NibolBooking[] = [];
    let finished = false;

    while (!finished) {
      console.log(`Scraping month: ${current.month + 1}/${current.year}`);
      await page.waitForTimeout(2000); // Give it time to load the grid contents

      const monthBookings: NibolBooking[] = await page.evaluate(
        ({ month, year, targetName }) => {
          const list: Array<{ date: string; type: string; details: string }> =
            [];

          // Identify all rows
          const rows = Array.from(document.querySelectorAll("tr"));

          // Prioritize finding the row with "(You)" or the specific target name
          const myRow = rows.find(
            (r) =>
              r.textContent?.includes("(You)") ||
              r.textContent?.toLowerCase().includes(targetName.toLowerCase()),
          );

          if (!myRow) return [];

          // Identify header days (usually in <thead> <th> spans)
          const headers = Array.from(document.querySelectorAll("thead th"));
          const dayHeaders = headers.map((h) => {
            const span = h.querySelector("span");
            const dayMatch = (span?.textContent || h.textContent)
              ?.trim()
              .match(/^(\d+)$/);
            return dayMatch ? Number.parseInt(dayMatch[1], 10) : null;
          });

          // Get all cells in the user's row
          const cells = Array.from(myRow.querySelectorAll("td"));

          cells.forEach((cell, idx) => {
            const day = dayHeaders[idx];
            if (!day) return; // Skip columns that don't represent a day (e.g., the Name column)

            // Detect booking type via classes or colors
            let type: string | null = null;
            if (
              cell.classList.contains("office") ||
              cell.querySelector('span[style*="rgb(22, 119, 255)"]')
            ) {
              type = "Office";
            } else if (
              cell.classList.contains("remote") ||
              cell.querySelector('span[style*="rgb(250, 173, 20)"]')
            ) {
              type = "Remote";
            }

            if (type) {
              const monthStr = String(month + 1).padStart(2, "0");
              const dayStr = String(day).padStart(2, "0");
              list.push({
                date: `${year}-${monthStr}-${dayStr}`,
                type: type,
                details: `Detected as ${type} in grid`,
              });
            }
          });

          return list;
        },
        { month: current.month, year: current.year, targetName: userName },
      );
      allBookings.push(...monthBookings);

      // Check if we need to navigate to the next month
      if (
        current.year < endYear ||
        (current.year === endYear && current.month < endMonth)
      ) {
        console.log("Navigating to next month...");
        await page
          .locator('button.ant-btn-icon-only:has(svg path[d^="M6 12H18.5"])')
          .click();
        await page.waitForTimeout(2000);
        current = await getVisibleMonthYear();
      } else {
        finished = true;
      }
    }

    // Final filtering by range if start/end are provided
    if (range) {
      const start = new Date(range.start);
      const end = new Date(range.end);
      return allBookings.filter((b) => {
        const bDate = new Date(b.date);
        return bDate >= start && bDate <= end;
      });
    }

    return allBookings;
  } catch (error) {
    console.error("Error fetching calendar data:", error);
    return [];
  } finally {
    await context.close();
  }
}

export async function collectNibol(
  force = false,
  range?: { start: string; end: string },
): Promise<string[]> {
  const NIBOL_DIR = path.join(process.cwd(), "data", "raw", "nibol");

  await nodeFs.mkdir(NIBOL_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const currentMonth = today.slice(0, 7);

  const effectiveRange = range ?? {
    start:
      process.env["COLLECT_SINCE"] ??
      `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`,
    end: today,
  };

  // Skip the entire Playwright scrape if current month was already collected today
  if (!force) {
    const meta = await readMeta(NIBOL_DIR);
    if (shouldSkipMonth(meta[currentMonth], currentMonth, ["nibol"])) {
      console.log("[Nibol] dati già raccolti — skip");
      const entries = await nodeFs.readdir(NIBOL_DIR).catch(() => [] as string[]);
      return entries
        .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
        .map((f) => path.join(NIBOL_DIR, f));
    }
  }

  console.log("[Nibol] starting collection...");
  const bookings = await nibolFetchCalendarData(effectiveRange);

  // Group by month
  const grouped: Record<string, NibolBooking[]> = {};
  for (const b of bookings) {
    const monthStr = b.date.slice(0, 7);
    if (!grouped[monthStr]) grouped[monthStr] = [];
    grouped[monthStr].push(b);
  }

  const meta = await readMeta(NIBOL_DIR);
  const outPaths: string[] = [];
  for (const [monthStr, monthBookings] of Object.entries(grouped)) {
    const isCurrentMonth = monthStr === currentMonth;
    // Skip past months that are already fully collected (unless forced)
    if (!force && !isCurrentMonth && shouldSkipMonth(meta[monthStr], monthStr, ["nibol"])) {
      outPaths.push(path.join(NIBOL_DIR, `${monthStr}.json`));
      continue;
    }
    const outPath = path.join(NIBOL_DIR, `${monthStr}.json`);
    await nodeFs.writeFile(outPath, JSON.stringify(monthBookings, null, 2), "utf-8");
    await writeMeta(NIBOL_DIR, monthStr, { lastExtractedDate: today, sources: ["nibol"] });
    outPaths.push(outPath);
    console.log(`  Nibol: ${monthStr} -> ${outPath}`);
  }

  return outPaths;
}
