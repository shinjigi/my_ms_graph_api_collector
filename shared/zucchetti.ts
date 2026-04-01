// Shared Zucchetti data types — used by both BE collectors and FE display.

export interface ZucchettiJustification {
  text: string;
  qta: string;
}

export interface ZucchettiRequest {
  text: string;
  qta?: string;
  status: string;
}

export interface ZucchettiDay {
  date: string; // YYYY-MM-DD
  dayOfWeek: string;
  timbrature: string;
  hOrd: string; // e.g. "7:42" or "" for holidays/weekends
  hEcc: string; // overtime hours
  orario: string; // e.g. "N02", "DOM", "SAB"
  giustificativi: ZucchettiJustification[];
  richieste: ZucchettiRequest[];
  warnings: string[];
}

export interface ZucchettiRequestParams {
  date: string; // YYYY-MM-DD
  type: string; // activity name (e.g. "SMART WORKING", "FERIE")
  fullDay: boolean;
  hours?: number;
  minutes?: number;
  headless?: boolean;
  scrapeAfterSubmit?: boolean;
}

export interface MonthData {
  month: number;
  year: number;
  header: unknown;
  days: ZucchettiDay[];
}

export type WorkLocation = "office" | "smart" | "travel" | "external" | "mixed" | "unknown";

export function isWorkday(day: ZucchettiDay): boolean {
  const orario = (day.orario ?? "").toUpperCase();
  return orario !== "DOM" && orario !== "SAB" && orario !== "FES";
}

export function parseZucchettiLocation(day: ZucchettiDay): WorkLocation {
  const giust = day.giustificativi.map((g) => g.text.toUpperCase());
  const reqs = (day.richieste ?? [])
    .filter((r) => r.status.toUpperCase() !== "CANCELLATA")
    .map((r) => r.text.toUpperCase());
  const allSignals = [...giust, ...reqs];

  if (allSignals.some((s) => s.includes("SMART"))) return "smart";
  if (allSignals.some((s) => s.includes("TRASFERTA"))) return "travel";
  if (allSignals.some((s) => s.includes("SERVIZIO ESTERNO"))) return "external";

  if (giust.length === 0 && reqs.length === 0) return "office";
  return "unknown";
}