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
    const header = columns.map(c => c.header.padEnd(c.width)).join(' | ');
    const separator = '-'.repeat(header.length);

    console.log(header);
    console.log(separator);

    rows.forEach(row => {
        const line = columns.map(c => c.value(row).padEnd(c.width)).join(' | ');
        console.log(line);
    });
}

export function parseTpDate(tpDate: string | null | undefined): string {
    if (!tpDate) return '-';
    const ms = parseInt(tpDate.replace(/\/Date\((\d+)[+-]\d+\)\//, '$1'), 10);
    return new Date(ms).toISOString().slice(0, 10);
}
