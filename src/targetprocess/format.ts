export function hasJsonFlag(): boolean {
    return process.argv.includes('--json');
}

export function printJson(data: unknown): void {
    console.log(JSON.stringify(data, null, 2));
}

export interface ColumnDef<T> {
    header: string;
    width:  number;
    value:  (row: T) => string;
}

export function printTable<T>(rows: T[], columns: ColumnDef<T>[]): void {
    const header    = columns.map(c => c.header.padEnd(c.width)).join(' | ');
    const separator = '-'.repeat(header.length);

    console.log(header);
    console.log(separator);

    rows.forEach(row => {
        const line = columns.map(c => c.value(row).padEnd(c.width)).join(' | ');
        console.log(line);
    });
}

/**
 * Parses a TargetProcess date string in /Date(ms±hhmm)/ format.
 * Returns ISO date string (YYYY-MM-DD) or '-' if input is falsy.
 *
 * The ms value is UTC epoch, but TP dates represent local midnight (e.g. CET
 * mezzanotte = UTC -1h). Adding the tz offset back gives the correct local date.
 */
export function parseTpDate(tpDate: string | null | undefined): string {
    if (!tpDate) return '-';
    const match = tpDate.match(/\/Date\((\d+)([+-])(\d{2})(\d{2})\)\//);
    if (!match) return '-';
    const ms     = parseInt(match[1], 10);
    const sign   = match[2] === '+' ? 1 : -1;
    const tzMs   = sign * (parseInt(match[3], 10) * 60 + parseInt(match[4], 10)) * 60_000;
    return new Date(ms + tzMs).toISOString().slice(0, 10);
}

/** Converts decimal hours to HH:MM string, e.g. 7.7 → "7:42". */
export function hoursToHhmm(h: number): string {
    const totalMinutes = Math.round(h * 60);
    const hh           = Math.floor(totalMinutes / 60);
    const mm           = totalMinutes % 60;
    return `${hh}:${String(mm).padStart(2, '0')}`;
}

/** Parses an HH:MM or H:MM string to decimal hours, e.g. "7:42" → 7.7. */
export function hhmmToHours(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h + (m ?? 0) / 60;
}
