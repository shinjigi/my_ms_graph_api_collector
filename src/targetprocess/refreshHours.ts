/**
 * Shared utility: refresh reportedHours on AggregatedDay objects
 * by querying the TargetProcess API for the latest time entries.
 *
 * Called by both the server analyze route and the CLI analyzer
 * before analyzeBatch() to ensure fresh data.
 *
 * On TP API failure: logs a warning and falls back to cached values
 * already present in the AggregatedDay objects (graceful degradation).
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { AggregatedDay } from "@shared/aggregator";
import { TargetprocessClient } from "./client";
import { parseTpDate, groupTpEntriesByTask } from "./format";
import { isEqual } from "date-fns";
import { createLogger } from "../logger";

const log = createLogger("tp-refresh");
const AGG_DIR = path.join(process.cwd(), "data", "aggregated");

/**
 * Fetches the latest time entries from TP and updates reportedHours
 * on each AggregatedDay in-place. Optionally persists the updated
 * values back to the aggregated JSON files on disk.
 *
 * @param days       - AggregatedDay objects to update (mutated in-place)
 * @param persist    - if true, write updated days back to data/aggregated/
 * @returns          true if TP was reachable and data was refreshed
 */
export async function refreshReportedHours(
    days: AggregatedDay[],
    persist = true,
): Promise<boolean> {
    if (days.length === 0) return true;

    try {
        const tp = new TargetprocessClient();
        const me = await tp.getMe();

        const dates = days.map((d) => d.date).sort();
        const minDate = dates[0];
        const maxDate = dates[dates.length - 1];

        log.info(
            `Refresh ore TP per ${days.length} giorni (${minDate} → ${maxDate}), utente ${me.FullName}...`,
        );

        const entries = await tp.getTimesByUserAndDateRange(
            me.Id,
            minDate,
            maxDate,
        );

        log.info(`Recuperate ${entries.length} time entries da TP`);

        for (const day of days) {
            const daily = entries.filter((e) => {
                const d = parseTpDate(e.Date);
                return d && isEqual(d, day.date);
            });
            day.reportedHours = groupTpEntriesByTask(daily);
        }

        if (persist) {
            await fs.mkdir(AGG_DIR, { recursive: true });
            let written = 0;
            for (const day of days) {
                const filePath = path.join(AGG_DIR, `${day.date}.json`);
                try {
                    await fs.writeFile(
                        filePath,
                        JSON.stringify(day, null, 2),
                        "utf-8",
                    );
                    written++;
                } catch (err) {
                    log.warn(
                        `Impossibile aggiornare ${filePath}: ${(err as Error).message}`,
                    );
                }
            }
            log.info(`Aggiornati ${written} file aggregated su disco`);
        }

        return true;
    } catch (err) {
        log.warn(
            `Impossibile raggiungere TP API: ${(err as Error).message} — uso dati cached`,
        );
        return false;
    }
}
