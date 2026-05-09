/** Shared utility functions — single source of truth. */

import type { WorkLocation, ZucchettiJustification } from "@shared/zucchetti";
import { ABSENCE_KEYWORDS } from "@shared/zucchetti";
import type { Day, DayStatus } from "./types";

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

export function locationEmoji(location?: WorkLocation): string {
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
      return "🌓"; // legacy value → treat as smart
    default:
      return "❓";
  }
}

export function locationShortLabel(location?: WorkLocation): string {
  switch (location) {
    case "smart":
      return "Smart working";
    case "office":
      return "In ufficio";
    case "travel":
      return "Trasferta";
    case "external":
      return "Servizio esterno";
    case "mixed":
      return "Misto";
    default:
      return "Sconosciuto";
  }
}

export function locationTitle(location?: WorkLocation): string {
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

export function rendStatusCls(status: DayStatus): string[] {
  if (!status) return [];
  if (status === "ok") return ["day-ok"];
  if (status === "warn" || status === "over") return ["day-warn"];
  if (status === "err") return ["day-err"];
  return [];
}

export function rendStatusIcon(status: DayStatus): string {
  if (status === "ok") return "✓";
  if (status === "warn" || status === "over") return "⚠";
  if (status === "err") return "✗";
  return "";
}

export function rendStatusIconCls(status: DayStatus): string {
  if (status === "ok") return "text-success";
  if (status === "warn" || status === "over") return "text-warning";
  if (status === "err") return "text-error opacity-80";
  return "opacity-0";
}

/** Formats hour deltas as ✓, -Xh, or +Xh */
export function formatDeltaHours(delta: number | null | undefined): string {
  if (delta == null) return "—";
  const rounded = +delta.toFixed(1);
  if (Math.abs(rounded) < 0.05) return "✓";
  return rounded > 0 ? `−${rounded}h` : `+${Math.abs(rounded)}h`;
}

/** Centralized coloring/styling for delta hours */
export function getDeltaHoursCls(delta: number, isHolidayAbsence = false): string {
  if (isHolidayAbsence) return "text-error font-bold";
  const rounded = +delta.toFixed(1);
  if (Math.abs(rounded) < 0.05) return "text-success font-black";
  return rounded > 0 ? "text-error" : "text-primary font-bold";
}

/** Extracts the first line of a multi-line string */
export function firstLine(msg: string): string {
  return msg.split('\n')[0];
}

/** Extracts all but the first line of a multi-line string */
export function restOfMessage(msg: string): string {
  const rest = msg.split('\n').slice(1).join('\n').trim();
  return rest || '';
}

