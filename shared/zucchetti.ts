// Shared Zucchetti data types — used by both BE collectors and FE display.

export interface ZucchettiRequest {
    text:   string;
    qta?:   string;
    status: string;
}

interface ZucchettiRawResponse {
  header: unknown;
  days: ZucchettiDay[];
}


export interface ZucchettiJustification {
    text: string;
    qta:  string;
}

export interface ZucchettiDay {
    date:           string;     // YYYY-MM-DD
    dayOfWeek:      string;
    timbrature:     string;
    hOrd:           string;     // e.g. "7:42" or "" for holidays/weekends
    hEcc:           string;     // overtime hours
    orario:         string;     // e.g. "N02", "DOM", "SAB"
    giustificativi: ZucchettiJustification[];
    richieste:      ZucchettiRequest[];
    warnings:       string[];
}

export interface MonthData {
  month: number;
  year: number;
  header: unknown;
  days: ZucchettiDay[];
}