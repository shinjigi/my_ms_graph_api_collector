import { parseArgs } from "node:util";
import { createLogger } from "../../logger";
import { startZucchettiSession } from "./session";
import { scrapeCartellino, validateDay } from "./scraper";
import { MonthData } from "@shared/zucchetti";
import { parseDateString, getYearMonth, addMonths } from "@shared/dates";

const log = createLogger("zucchetti-collector");

const options = {
  date: { type: "string" as const }, // YYYY-MM-DD to identify the month
  month: { type: "string" as const }, // 1-12
  year: { type: "string" as const }, // YYYY
  start: { type: "string" as const }, // YYYY-MM
  end: { type: "string" as const }, // YYYY-MM
};

const args = process.argv.slice(2);
const { values } = parseArgs({ options, args, strict: false }) as {
  values: { [key: string]: string | undefined };
};

let targetMonth = values.month;
let targetYear = values.year;
const startMonth = values.start;
const endMonth = values.end;

// If date is provided, extract month and year from it
if (values.date) {
  const { month, year } = getYearMonth(values.date);
  targetMonth = month.toString();
  targetYear = year.toString();
}

void (async () => {
  // Use shared session for login + Cartellino navigation
  const session = await startZucchettiSession();
  const { browser, page: newPage } = session;

  const waitStable = async () => {
    await newPage.waitForLoadState("networkidle");
    await newPage.waitForSelector('select[id$="_TxtAnno"]:not([disabled])', {
      state: "visible",
      timeout: 15000,
    });
    await newPage.waitForSelector('select[id$="_TxtMese"]:not([disabled])', {
      state: "visible",
      timeout: 15000,
    });
  };

  // Determine the list of months to scrape
  const monthsToScrape: { month: number; year: number }[] = [];
  if (startMonth && endMonth) {
    let current = parseDateString(startMonth);
    const end = parseDateString(endMonth);
    while (current <= end) {
      monthsToScrape.push(getYearMonth(current));
      current = addMonths(current, 1);
    }
  } else if (targetMonth && targetYear) {
    monthsToScrape.push({
      month: Number.parseInt(targetMonth, 10),
      year: Number.parseInt(targetYear, 10),
    });
  } else {
    // Default to current month if nothing specified
    monthsToScrape.push(getYearMonth());
  }

  const allResults: MonthData[] = [];

  for (let i = 0; i < monthsToScrape.length; i++) {
    const { month, year } = monthsToScrape[i];
    log.info(`Processing ${month}/${year}...`);

    if (i === 0) {
      // First month: use dropdowns
      log.info(`Setting target period to ${month}/${year} via dropdowns...`);
      const yearSelect = newPage
        .locator('select[id$="_TxtAnno"]')
        .filter({ visible: true })
        .first();
      await yearSelect.selectOption(year.toString());
      await waitStable();

      const monthSelect = newPage
        .locator('select[id$="_TxtMese"]')
        .filter({ visible: true })
        .first();
      await monthSelect.selectOption(month.toString());
      await waitStable();
    } else {
      // Subsequent months: use navigation buttons (requested)
      // But we need to know if we are going forward or backward.
      // Since we sorted them forward, we use BtnMeseNext.
      log.info(`Navigating to next month via button...`);
      const nextBtn = newPage
        .locator('a[id$="_BtnMeseNext"]')
        .filter({ visible: true })
        .first();
      await nextBtn.click();
      await waitStable();
      await newPage.waitForTimeout(3000); // Added safety wait
    }

    log.info("Extracting timesheet data...");
    const { header, days } = await scrapeCartellino(newPage);
    const validatedData = days.map((d) => validateDay(d));
    allResults.push({ month, year, header, days: validatedData });
  }

  console.log("--- START JSON ---");
  // If multiple months, return as array of months
  if (allResults.length === 1) {
    console.log(
      JSON.stringify(
        { header: allResults[0].header, days: allResults[0].days },
        null,
        2,
      ),
    );
  } else {
    console.log(JSON.stringify(allResults, null, 2));
  }
  console.log("--- END JSON ---");

  await browser.close();
})();
