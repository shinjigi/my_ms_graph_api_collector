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

// --- Activity Definitions (from Zucchetti dropdowns) ---

export const ZUCCHETTI_ACTIVITIES = [
  "DONAZIONE SANGUE",
  "EX FESTIVITA'",
  "FERIE",
  "FORMAZIONE",
  "GIORNO PERMESSO STUDIO RETR. A",
  "MALATTIA",
  "PERM. AGG.VO INSERIMENTO ASILO",
  "PERMESSO NON RETRIBUITO MALATTIA FIGLIO 9 -14 ANNI",
  "PERMESSO NON RETRIBUITO MALATTIA FIGLIO FINO 3 ANN",
  "PERMESSO NON RETRIBUITO MALATTIA FIGLIO FINO 8  AN",
  "PERMESSO PER ESAMI",
  "PERMESSO STUDIO",
  "RIPOSO COMPENSATIVO",
  "RIPOSO COMPENSATIVO ELEZIONI",
  "SERVIZIO ESTERNO",
  "SMART WORKING",
  "Straordinario da autorizzare",
  "TRASFERTA CON PERNOTTO ALTRI P",
  "TRASFERTA CON PERNOTTO BELGIO",
  "TRASFERTA CON PERNOTTO BRASILE",
  "TRASFERTA CON PERNOTTO ITALIA",
  "TRASFERTA CON PERNOTTO PORTOGA",
  "TRASFERTA CON PERNOTTO SPAGNA",
  "TRASFERTA SENZA PERNOTTO ALTRI",
  "TRASFERTA SENZA PERNOTTO BELGI",
  "TRASFERTA SENZA PERNOTTO BRASI",
  "TRASFERTA SENZA PERNOTTO ITALI",
  "TRASFERTA SENZA PERNOTTO PORTO",
  "TRASFERTA SENZA PERNOTTO SPAGN",
  "VISITA MEDICA",
];

// Activities that represent working away from the default office
export const LOCATION_ACTIVITIES: Record<string, WorkLocation> = {
  "SMART WORKING": "smart",
  "TRASFERTA": "travel",
  "SERVIZIO ESTERNO": "external",
};

// Activities that reduce the contractual time to be reported on TargetProcess
export const ABSENCE_KEYWORDS = [
  "FERIE",
  "EX FESTIVITA",
  "PERMESSO",
  "MALATTIA",
  "RIPOSO COMPENSATIVO",
  "DONAZIONE SANGUE",
  "VISITA MEDICA",
  "CONGEDO",
];

export function isWorkday(day: ZucchettiDay): boolean {
  const orario = (day.orario ?? "").toUpperCase();
  return orario !== "DOM" && orario !== "SAB" && orario !== "FES";
}

/** 
 * Scans justifications and pending requests to find location-altering activities.
 */
export function parseZucchettiLocation(day: ZucchettiDay): WorkLocation {
  const giust = day.giustificativi.map((g) => g.text.toUpperCase());
  const reqs = (day.richieste ?? [])
    .filter((r) => r.status.toUpperCase() !== "CANCELLATA")
    .map((r) => r.text.toUpperCase());
  
  const allSignals = [...giust, ...reqs];

  for (const [kw, loc] of Object.entries(LOCATION_ACTIVITIES)) {
      if (allSignals.some(s => s.includes(kw))) return loc;
  }

  if (giust.length === 0 && reqs.length === 0) return "office";
  return "unknown";
}

/**
 * Calculates decimal hours of absence (Ferie, Permissions, etc.) from Zucchetti data.
 * If no quantity is specified, a whole day (7.7h) is assumed for absence types.
 */
export function calculateAbsenceHours(day: ZucchettiDay): number {
    const activeReqs = (day.richieste ?? []).filter(r => r.status.toUpperCase() !== "CANCELLATA");
    const allSignals = [...day.giustificativi, ...activeReqs];
    
    let totalAbsence = 0;

    for (const sig of allSignals) {
        const text = sig.text.toUpperCase();
        if (ABSENCE_KEYWORDS.some(kw => text.includes(kw))) {
            const qta = "qta" in sig ? (sig as { qta: string }).qta : undefined;
            if (qta && typeof qta === "string" && qta.includes(":")) {
                const [hh, mm] = qta.split(":").map(Number);
                totalAbsence += hh + (mm / 60);
            } else {
                // If no quantity but it's an absence keyword, assume full day (conservative)
                // but only if it's not already accounted for by another entry
                return 7.7; 
            }
        }
    }

    return Math.min(7.7, totalAbsence);
}