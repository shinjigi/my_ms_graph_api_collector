/** Shared utility functions — single source of truth. */

import type { ZucchettiJustification } from "@shared/zucchetti";
import { ABSENCE_KEYWORDS } from "@shared/zucchetti";
import type { Day } from "./types";

const STATE_COLORS: Record<string, string> = {
  Inception: "#94a3b8",
  "Dev/Unit test": "#6366f1",
  Testing: "#f59e0b",
};

export function stateColor(state: string): string {
  return STATE_COLORS[state] ?? "#94a3b8";
}

export function tpLink(id: number): string {
  const base =
    import.meta.env.VITE_TP_BASE_URL ?? "https://your-org.tpondemand.com";
  return `${base}/entity/${id}`;
}

// ---------------------------------------------------------------------------
// Location + giustificativi emoji helpers
// ---------------------------------------------------------------------------

export function locationEmoji(location: Day["location"]): string {
  switch (location) {
    case "smart":
      return "🏠";
    case "office":
      return "🏢";
    case "travel":
      return "✈️";
    case "external":
      return "🚗";
    case "mixed":
      return "🏠"; // legacy value → treat as smart
    default:
      return "❓";
  }
}

export function locationTitle(location: Day["location"]): string {
  switch (location) {
    case "smart":
      return "Smart working (Nibol/Zucchetti)";
    case "office":
      return "In ufficio (Nibol)";
    case "travel":
      return "Trasferta (Zucchetti)";
    case "external":
      return "Servizio esterno (Zucchetti)";
    case "mixed":
      return "Misto";
    default:
      return "Luogo non rilevato — Nibol non sincronizzato o nessuna dichiarazione";
  }
}

/** Maps giustificativi to activity emojis, excluding location-related entries. */
const ACTIVITY_PATTERNS: Array<{ match: RegExp; emoji: string }> = [
  { match: new RegExp(ABSENCE_KEYWORDS.join("|"), "i"), emoji: "🏖️" },
  { match: /MALATTIA/i, emoji: "🤒" },
  { match: /VISITA MEDICA/i, emoji: "🩺" },
  { match: /DONAZIONE SANGUE/i, emoji: "🩸" },
  { match: /FORMAZIONE/i, emoji: "🎓" },
  { match: /PERM.*ASILO|PERMESSO NON RETRIB/i, emoji: "👶" },
  { match: /PERMESSO STUDIO|GIORNO PERMESSO STUDIO/i, emoji: "📚" },
  { match: /PERMESSO PER ESAMI/i, emoji: "📝" },
  { match: /STRAORDINARIO/i, emoji: "⏰" },
];

export function giustActivityEmojis(
  giustificativi: ZucchettiJustification[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const g of giustificativi) {
    for (const { match, emoji } of ACTIVITY_PATTERNS) {
      if (match.test(g.text) && !seen.has(emoji)) {
        seen.add(emoji);
        result.push(emoji);
      }
    }
  }
  return result;
}

export function rendStatusCls(status: "ok" | "warn" | "err" | null): string[] {
  if (!status) return [];
  if (status === "ok") return ["day-ok"];
  if (status === "warn") return ["day-warn"];
  if (status === "err") return ["day-err"];
  return [];
}

export function rendStatusIcon(status: "ok" | "warn" | "err" | null): string {
  if (status === "ok") return "✓";
  if (status === "warn") return "⚠";
  if (status === "err") return "✗";
  return "";
}

export function rendStatusIconCls(status: "ok" | "warn" | "err" | null): string {
  if (status === "ok") return "text-success";
  if (status === "warn") return "text-warning";
  if (status === "err") return "text-error opacity-80";
  return "opacity-0";
}

/** Formats hour deltas as ✓, -Xh, or +Xh */
export function formatDeltaHours(delta: number): string {
  const rounded = +delta.toFixed(1);
  if (Math.abs(rounded) < 0.05) return "✓";
  return rounded > 0 ? `−${rounded}h` : `+${Math.abs(rounded)}h`;
}
