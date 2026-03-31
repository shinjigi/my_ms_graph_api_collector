/**
 * Calcola la data della Pasqua per un dato anno (Algoritmo di Butcher)
 */
function getEaster(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

export interface Holiday {
  date: string; // Formato YYYY-MM-DD per confronti facili
  name: string;
}

/**
 * Genera l'elenco delle festività italiane per un anno specifico
 */
export function getItalianHolidays(year: number): Holiday[] {
  const easter = getEaster(year);
  const angelMonday = new Date(easter);
  angelMonday.setDate(easter.getDate() + 1);

  // Helper per formattare la data senza impazzire con i fusi orari
  const formatDate = (m: number, d: number) =>
    `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

  const formatFullDate = (date: Date) => date.toISOString().split("T")[0];

  return [
    { date: formatDate(1, 1), name: "Capodanno" },
    { date: formatDate(1, 6), name: "Epifania" },
    { date: formatFullDate(easter), name: "Pasqua" },
    { date: formatFullDate(angelMonday), name: "Lunedì dell'Angelo" },
    { date: formatDate(4, 25), name: "Festa della Liberazione" },
    { date: formatDate(5, 1), name: "Festa del Lavoro" },
    { date: formatDate(6, 2), name: "Festa della Repubblica" },
    { date: formatDate(8, 15), name: "Ferragosto" },
    { date: formatDate(11, 1), name: "Ognissanti" },
    { date: formatDate(12, 8), name: "Immacolata Concezione" },
    { date: formatDate(12, 25), name: "Natale" },
    { date: formatDate(12, 26), name: "Santo Stefano" },
  ];
}

// Creiamo una cache per evitare ricalcoli inutili
const holidaysCache = new Map<number, Holiday[]>();

export function dateToString(d: Date): string {
  // Use local date components — toISOString() uses UTC and shifts in CET/CEST
  const yr = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${yr}-${mo}-${day}`;
}

export function findHoliday(date: Date): Holiday | undefined {
  const year = date.getFullYear();

  // Se non abbiamo ancora calcolato l'anno, lo facciamo una volta sola
  if (!holidaysCache.has(year)) {
    holidaysCache.set(year, getItalianHolidays(year));
  }

  const yearHolidays = holidaysCache.get(year)!;
  const dateStr = dateToString(date);

  return yearHolidays.find((h) => h.date === dateStr);
}
