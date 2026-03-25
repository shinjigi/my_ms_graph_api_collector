/** Shared utility functions — single source of truth. */

const STATE_COLORS: Record<string, string> = {
    'Inception':     '#94a3b8',
    'Dev/Unit test': '#6366f1',
    'Testing':       '#f59e0b',
};

export function stateColor(state: string): string {
    return STATE_COLORS[state] ?? '#94a3b8';
}

export function tpLink(id: number): string {
    return `https://your-org.tpondemand.com/entity/${id}`;
}

