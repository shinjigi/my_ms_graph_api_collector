import { Page, Frame } from "playwright";
import { parseArgs } from "node:util";
import { createLogger } from "../../logger";

const log = createLogger("zucchetti-update");
import { startZucchettiSession } from "./session";
import { scrapeSingleDay, validateDay, patchRawZucchettiFile } from "./scraper";
import { aggregateSingleDay } from "../../aggregators/aggregator";
import type { WeekDayData } from "@shared/week";
import type { ZucchettiRequestResult } from "@shared/submit";
import { ZucchettiRequestParams, ZUCCHETTI_ACTIVITIES } from "@shared/zucchetti";
import { fileURLToPath } from "node:url";

const isMainModule =
  process.argv[1] &&
  (process.argv[1] === fileURLToPath(import.meta.url) ||
    process.argv[1].includes("zucchetti/updateData"));

/**
 * After submit (or skip), scrape the current day from the Cartellino,
 * patch the raw Zucchetti file, re-aggregate the day, and return WeekDayData.
 */
async function postSubmitScrape(
  page: Page | Frame,
  targetDate: string,
): Promise<WeekDayData> {
  log.info(`Post-submit scrape for ${targetDate}...`);
  // Wait for grid to reload after submission (iframe reloads after Invia)
  await page.waitForSelector('tr[id*="_Grid1_row"]', { state: "visible", timeout: 20000 });
  const scraped = await scrapeSingleDay(page, new Date(targetDate));
  if (!scraped)
    throw new Error(`Day ${targetDate} not found in Cartellino grid.`);

  const validated = validateDay(scraped);
  await patchRawZucchettiFile(targetDate, validated);

  const agg = await aggregateSingleDay(new Date(targetDate), validated);

  return {
    date: agg.date,
    isWorkday: agg.isWorkday,
    oreTarget: agg.oreTarget,
    location: agg.location,
    nibol: agg.nibol,
    holiday: !agg.isWorkday,
    holidayType: null,
    zucchetti: agg.zucchetti,
    calendar: agg.calendar,
    emails: agg.emails,
    teams: agg.teams,
    svnCommits: agg.svnCommits,
    gitCommits: agg.gitCommits,
    browserVisits: agg.browserVisits,
  };
}

/**
 * Submits an activity request to the Zucchetti portal via Playwright.
 * Uses the shared session module for login and Cartellino navigation.
 * If scrapeAfterSubmit is true, also scrapes the updated day and re-aggregates.
 */
export async function submitZucchettiRequest(
  params: ZucchettiRequestParams,
): Promise<ZucchettiRequestResult> {
  const {
    date: targetDate,
    type: rawType,
    fullDay: isFullDay,
    hours = 0,
    minutes = 0,
    headless,
    scrapeAfterSubmit = false,
  } = params;
  const activityType = rawType.trim().toUpperCase();

  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) {
    return {
      success: false,
      message: `Invalid date format: "${targetDate}". Expected YYYY-MM-DD.`,
    };
  }

  const matchedActivity = ZUCCHETTI_ACTIVITIES.find((a) =>
    a.toUpperCase().includes(activityType),
  );
  if (!matchedActivity) {
    return {
      success: false,
      message: `Activity type "${activityType}" not recognized. Valid: ${ZUCCHETTI_ACTIVITIES.join(", ")}`,
    };
  }

  // Use shared session for login + Cartellino navigation (headless resolved from env if not explicit)
  const session = await startZucchettiSession(headless);
  const { browser, page: newPage } = session;

  const waitStable = async (target: Page | Frame) => {
    await newPage.waitForLoadState("networkidle");
    await target.waitForSelector('select[id$="_TxtAnno"]:not([disabled])', {
      state: "visible",
      timeout: 15000,
    });
    await target.waitForSelector('select[id$="_TxtMese"]:not([disabled])', {
      state: "visible",
      timeout: 15000,
    });
  };

  try {
    // 1. Identifica il frame che contiene il cartellino (può essere la pagina principale o un iframe)
    const frames = newPage.frames();
    let gridFrame: Page | Frame = newPage;
    let foundGrid = false;

    log.info("Ricerca del frame contenente la griglia del cartellino...");
    for (const frame of frames) {
      const rows = await frame.locator('tr[id*="_Grid1_row"]').count();
      if (rows > 0) {
        gridFrame = frame;
        foundGrid = true;
        log.info(`Griglia trovata nel frame: ${frame.name() || frame.url()}`);
        break;
      }
    }

    if (!foundGrid) {
      log.warn(
        "Griglia non trovata nei frames, procedo con la pagina principale.",
      );
    }

    // 1.5 Imposta il periodo corretto (Mese/Anno) se necessario
    const [y, m] = targetDate.split("-");
    const targetYear = y;
    const targetMonth = Number.parseInt(m, 10).toString();

    log.info(`Setting target period to ${targetMonth}/${targetYear}...`);
    const yearSelect = gridFrame
      .locator('select[id$="_TxtAnno"]')
      .filter({ visible: true })
      .first();
    await yearSelect.selectOption(targetYear);
    await waitStable(gridFrame);

    const monthSelect = gridFrame
      .locator('select[id$="_TxtMese"]')
      .filter({ visible: true })
      .first();
    await monthSelect.selectOption(targetMonth);
    await waitStable(gridFrame);
    await newPage.waitForTimeout(2000); // Safety wait for grid to refresh

    // 2. Check if existing activities
    log.info(`Checking existing activities for ${targetDate}...`);
    const dayCell = gridFrame
      .locator("td.richieste")
      .filter({ has: gridFrame.locator(`span[onclick*="${targetDate}"]`) })
      .first();

    if ((await dayCell.count()) > 0) {
      const activityRows = dayCell.locator("div.fakeRow");
      const rowCount = await activityRows.count();
      for (let i = 0; i < rowCount; i++) {
        const row = activityRows.nth(i);
        const rowText = await row.innerText();
        if (rowText.toUpperCase().includes(matchedActivity.toUpperCase())) {
          const isCancelled =
            (await row.locator('span[title="Cancellata"]').count()) > 0;
          if (!isCancelled) {
            log.info(`Activity already exists for ${targetDate}. Skipping.`);
            const result: ZucchettiRequestResult = {
              success: true,
              message: `"${matchedActivity}" already exists for ${targetDate}.`,
              skipped: true,
            };
            // Still scrape to refresh day data even when skipping
            if (scrapeAfterSubmit) {
              try {
                result.dayUpdate = await postSubmitScrape(gridFrame, targetDate);
              } catch (err) {
                result.scrapeError = (err as Error).message;
              }
            }
            return result;
          }
        }
      }
    }

    // 3. Click "Nuova richiesta" for target date
    log.info(`Submitting "${matchedActivity}" for ${targetDate}...`);
    try {
      const nuevaBtn = gridFrame.locator(
        `span[title="Nuova richiesta"][onclick*="${targetDate}"]`,
      );
      await nuevaBtn.waitFor({ state: "visible", timeout: 10000 });
      await nuevaBtn.click();
    } catch (clickErr) {
      await newPage.screenshot({
        path: "click_error_debug.png",
        fullPage: true,
      });
      throw new Error(
        `Failed to click "Nuova richiesta" for ${targetDate}: ${
          (clickErr as Error).message
        }`,
        { cause: clickErr },
      );
    }

    // Wait for modal and select activity
    await newPage.waitForTimeout(4000);

    try {
      let targetFrame: Page | Frame = newPage;
      const frames = newPage.frames();
      const dropdownSelector =
        'select[id$="_Combobox23"], select.Combobox23_ctrl';

      let dropdown = null;
      for (const frame of frames) {
        const found = frame.locator(dropdownSelector).first();
        if ((await found.count()) > 0) {
          targetFrame = frame;
          dropdown = found;
          break;
        }
      }

      if (!dropdown) {
        dropdown = newPage.locator(dropdownSelector).first();
        await dropdown.waitFor({ state: "attached", timeout: 5000 });
      }

      await dropdown.selectOption({ label: matchedActivity });
      log.info(`Selected "${matchedActivity}".`);
      await (targetFrame as Page).waitForTimeout(3000);

      // Handle duration — Zucchetti has TWO "Giornata intera" checkboxes:
      //   InteraBox  (hidden) — used for specific event types
      //   cPeriodoBox (visible) — the standard full-day checkbox
      // We must target the VISIBLE one (cPeriodoBox) first.
      if (isFullDay) {
        log.info('Checking "Giornata intera" (cPeriodoBox)...');
        const checked = await targetFrame.evaluate(() => {
          // Find the visible checkbox div — cPeriodoBox is visible for standard activities
          const cpDiv = document.querySelector<HTMLDivElement>(
            'div[id$="_cPeriodoBox_div"]',
          );
          if (cpDiv && cpDiv.style.display !== "none") {
            const cb = cpDiv.querySelector<HTMLInputElement>(
              'input[type="checkbox"]',
            );
            if (cb && !cb.checked) {
              cb.click();
              return "cPeriodoBox";
            }
            if (cb?.checked) return "cPeriodoBox-already";
          }
          // Fallback: InteraBox
          const ibDiv = document.querySelector<HTMLDivElement>(
            'div[id$="_InteraBox_div"]',
          );
          if (ibDiv && ibDiv.style.display !== "none") {
            const cb = ibDiv.querySelector<HTMLInputElement>(
              'input[type="checkbox"]',
            );
            if (cb && !cb.checked) {
              cb.click();
              return "InteraBox";
            }
            if (cb?.checked) return "InteraBox-already";
          }
          return null;
        });

        if (checked) {
          log.info(`Checked via ${checked}.`);
        } else {
          throw new Error(
            'Could not find any visible "Giornata intera" checkbox.',
          );
        }
        // Wait for Zucchetti JS to react to the checkbox change
        await (targetFrame as Page).waitForTimeout(1000);
      } else {
        log.info(`Setting time to ${hours}:${minutes}...`);
        // qtahh/qtamm inputs may be hidden — use evaluate for reliability
        await targetFrame.evaluate(
          ({ h, m }: { h: number; m: number }) => {
            const hInput = document.querySelector<HTMLInputElement>(
              'input[id$="_qtahh"]',
            );
            const mInput = document.querySelector<HTMLInputElement>(
              'input[id$="_qtamm"]',
            );
            if (hInput) {
              hInput.value = String(h);
              hInput.dispatchEvent(new Event("change", { bubbles: true }));
              hInput.dispatchEvent(new Event("blur", { bubbles: true }));
            }
            if (mInput) {
              mInput.value = String(m);
              mInput.dispatchEvent(new Event("change", { bubbles: true }));
              mInput.dispatchEvent(new Event("blur", { bubbles: true }));
            }
          },
          { h: hours, m: minutes },
        );
      }

      // Click "Invia"
      log.info("Clicking Invia...");
      const inviaBtn = targetFrame.locator('input[id$="_InvioButton"]').first();
      await inviaBtn.waitFor({ state: "visible", timeout: 10000 });
      await inviaBtn.click({ force: true });
    } catch (err) {
      await newPage.screenshot({
        path: "dropdown_error_debug.png",
        fullPage: true,
      });
      return {
        success: false,
        message: `Modal interaction failed: ${(err as Error).message}`,
      };
    }

    // Verification
    log.info("Verifying submission...");
    const result: ZucchettiRequestResult = { success: true, message: "" };
    try {
      await newPage.waitForTimeout(3000);
      await newPage.waitForSelector(`text=${matchedActivity}`, {
        state: "visible",
        timeout: 30000,
      });
      log.info(`Verified "${matchedActivity}" on timesheet for ${targetDate}.`);
      result.message = `"${matchedActivity}" submitted for ${targetDate}.`;
    } catch {
      await newPage.screenshot({
        path: "verification_fyi.png",
        fullPage: true,
      });
      result.message = `Request sent for ${targetDate}, but verification timed out. Check portal manually.`;
    }

    // Post-submit scrape: close the modal first so Zucchetti reloads the grid,
    // then re-identify the frame and scrape the updated day data.
    if (scrapeAfterSubmit) {
      try {
        // Close the success modal (spModalLayer_closebtn_2) — this triggers grid reload
        const closeBtn = newPage.locator('[id$="_closebtn_2"], [id$="_closebtn"]').first();
        if (await closeBtn.count() > 0) {
          log.info("Closing submission modal...");
          await closeBtn.click();
        }
        // Zucchetti keeps connections alive — networkidle never fires.
        // A short fixed wait is enough; postSubmitScrape waits on the grid rows.
        await newPage.waitForTimeout(3000);

        // Re-identify the grid frame after reload (old reference may be stale)
        for (const frame of newPage.frames()) {
          const rows = await frame.locator('tr[id*="_Grid1_row"]').count();
          if (rows > 0) {
            gridFrame = frame;
            break;
          }
        }

        result.dayUpdate = await postSubmitScrape(gridFrame, targetDate);
      } catch (err) {
        result.scrapeError = (err as Error).message;
        log.warn(`Post-submit scrape failed: ${result.scrapeError}`);
      }
    }

    return result;
  } finally {
    await browser.close();
  }
}

// --- CLI entry point ---
if (isMainModule) {
  const cliOptions = {
    date: { type: "string" as const },
    type: { type: "string" as const, default: "SMART WORKING" },
    "full-day": { type: "boolean" as const, default: false },
    hours: { type: "string" as const, default: "0" },
    minutes: { type: "string" as const, default: "0" },
  };

  const { values } = parseArgs({
    options: cliOptions,
    args: process.argv.slice(2),
    strict: false,
  });

  if (!values.date) {
    log.error(
      'Usage: npm run zucchetti:update -- --date=YYYY-MM-DD [--full-day=true] [--type="SMART WORKING"] [--hours=4] [--minutes=30]',
    );
    process.exit(1);
  }

  submitZucchettiRequest({
    date: values.date as string,
    type: values.type as string,
    fullDay: values["full-day"] as boolean,
    hours: Number.parseInt(values.hours as string, 10),
    minutes: Number.parseInt(values.minutes as string, 10),
    // headless resolved from ZUCCHETTI_HEADLESS env var (default true)
  })
    .then((result) => {
      log.info(
        result.success ? `OK: ${result.message}` : `FAIL: ${result.message}`,
      );
      process.exit(result.success ? 0 : 1);
    })
    .catch((err) => {
      log.error("Fatal error during Zucchetti update:");
      log.error(err instanceof Error ? err.stack || err.message : String(err));
      process.exit(1);
    });
}
