/**
 * Zucchetti API Module
 */
import { ZucchettiSession } from "./session";

export interface ZucchettiApiRawResponse {
  Fields: string[];
  Data: any[][];
}

import type { ZucchettiDay } from "@shared/zucchetti";

/**
 * Interroga direttamente l'endpoint SQLDataProviderServer.
 */
export async function fetchZucchettiTimesheet(
  session: ZucchettiSession,
  year: string,
  month: string,
): Promise<ZucchettiApiRawResponse> {
  const url = `${session.baseUrl}/WFzcs01/servlet/SQLDataProviderServer`;

  const params = new URLSearchParams({
    rows: "300",
    startrow: "0",
    count: "false",
    sqlcmd: "rows:hfpr_fcartellino3",
    IDCOMPANY: session.idCompany,
    IDEMPLOY: session.idEmploy,
    Anno: year,
    Mese: month,
    m_cCheck: session.m_cCheck,
    isclientdb: "false",
    Visualiz: "",
    LaFlexi: "N",
    HHMM: "N",
  });

  console.log(`  [API] ── fetchZucchettiTimesheet ──`);
  console.log(`  [API] URL: ${url}`);
  console.log(`  [API] Params:
    rows=300, startrow=0, count=false
    sqlcmd=rows:hfpr_fcartellino3
    IDCOMPANY="${session.idCompany}" ${session.idCompany ? "✅" : "⚠️  VUOTO"}
    IDEMPLOY="${session.idEmploy}"   ${session.idEmploy ? "✅" : "⚠️  VUOTO"}
    Anno="${year}" Mese="${month}"
    m_cCheck="${session.m_cCheck}"  ${session.m_cCheck ? "✅" : "⚠️  VUOTO"}
    isclientdb=false, Visualiz='', LaFlexi=N, HHMM=N`);
  console.log(
    `  [API] Cookie header (primi 200 char): ${session.cookies.slice(0, 200)}...`,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: session.cookies,
        Referer: `${session.baseUrl}/WFzcs01/servlet/hfpr_bcapcarte`,
        "X-Requested-With": "XMLHttpRequest",
      },
      body: params.toString(),
    });
  } catch (fetchErr) {
    console.error(
      `  [API] ❌ Errore di rete durante fetch: ${(fetchErr as Error).message}`,
    );
    throw fetchErr;
  }

  console.log(
    `  [API] Response: status=${response.status} statusText="${response.statusText}"`,
  );
  console.log(`  [API] Content-Type: ${response.headers.get("content-type")}`);

  if (!response.ok) {
    const body = await response
      .text()
      .catch(() => "(impossibile leggere body)");
    console.error(
      `  [API] ❌ HTTP ${response.status} – body (primi 500 char):\n${body.slice(0, 500)}`,
    );
    throw new Error(
      `Zucchetti API error: ${response.status} – ${body.slice(0, 200)}`,
    );
  }

  const responseText = await response.text();
  console.log(
    `  [API] Response body (primi 300 char): ${responseText.slice(0, 300)}`,
  );

  let parsed: ZucchettiApiRawResponse;
  try {
    parsed = JSON.parse(responseText) as ZucchettiApiRawResponse;
  } catch (jsonErr) {
    console.error(
      `  [API] ❌ Risposta non è JSON valido. Body completo:\n${responseText.slice(0, 1000)}`,
    );
    throw new Error(
      `Zucchetti: risposta non JSON – ${(jsonErr as Error).message}`,
    );
  }

  const fields = parsed.Fields ?? [];
  const data = parsed.Data ?? [];
  console.log(
    `  [API] Fields ricevuti (${fields.length}): [${fields.join(", ")}]`,
  );
  console.log(`  [API] Righe dati ricevute: ${data.length}`);

  if (data.length > 0) {
    console.log(`  [API] Prima riga (campione): ${JSON.stringify(data[0])}`);
  } else {
    console.warn(`  [API] ⚠️  Nessuna riga dati ricevuta! Possibili cause:`);
    console.warn(`  [API]    - m_cCheck non valido o sessione scaduta`);
    console.warn(`  [API]    - IDCOMPANY / IDEMPLOY errati o vuoti`);
    console.warn(`  [API]    - Anno/Mese fuori range o non autorizzati`);
    console.warn(`  [API]    - sqlcmd errato per questa versione di Zucchetti`);
  }

  // Verifica campi attesi
  const expectedFields = [
    "DATA",
    "GIORNO",
    "ORARIO",
    "HORD",
    "HECC",
    "ORAINI1",
    "ORAFIN1",
    "DESCRIZIONE1",
    "QTA1",
  ];
  const missingFields = expectedFields.filter((f) => !fields.includes(f));
  if (missingFields.length > 0) {
    console.warn(
      `  [API] ⚠️  Campi ATTESI ma NON trovati nella risposta: [${missingFields.join(", ")}]`,
    );
    console.warn(
      `  [API]    Campi effettivamente presenti: [${fields.join(", ")}]`,
    );
  } else {
    console.log(`  [API] Tutti i campi attesi sono presenti ✅`);
  }

  return parsed;
}

/**
 * Converte la risposta "piatta" dell'API Zucchetti nel formato strutturato ZucchettiDay[].
 */
export function mapRawToZucchettiDays(
  raw: ZucchettiApiRawResponse,
): ZucchettiDay[] {
  const { Fields, Data } = raw;

  console.log(`  [MAP] ── mapRawToZucchettiDays ──`);
  console.log(`  [MAP] Fields: [${Fields.join(", ")}]`);
  console.log(`  [MAP] Righe da mappare: ${Data.length}`);

  if (Data.length === 0) {
    console.warn(
      `  [MAP] ⚠️  Nessuna riga da mappare – output sarà un array vuoto.`,
    );
    return [];
  }

  const results = Data.map((row, rowIdx) => {
    const getField = (name: string) => {
      const idx = Fields.indexOf(name);
      if (idx === -1 && rowIdx === 0) {
        console.warn(
          `  [MAP] ⚠️  Campo "${name}" non trovato nei Fields (riga ${rowIdx})`,
        );
      }
      return idx !== -1 ? row[idx] || "" : "";
    };

    const date = getField("DATA");
    const dayOfWeek = getField("GIORNO");
    const orario = getField("ORARIO");
    const hOrd = getField("HORD");
    const hEcc = getField("HECC");

    // Timbrature
    const t1 = getField("ORAINI1");
    const t2 = getField("ORAFIN1");
    const timbrature = t1 && t2 ? `${t1} ${t2}` : "";

    // Giustificativi
    const giustificativi: { text: string; qta: string }[] = [];
    const desc1 = getField("DESCRIZIONE1").split("&&&");
    const qta1 = getField("QTA1").split("&&&");

    desc1.forEach((text: string, i: number) => {
      if (text.trim()) {
        giustificativi.push({ text: text.trim(), qta: qta1[i] || "" });
      }
    });

    const richieste: { text: string; status: string }[] = [];

    // Log di una riga campione ogni 5 righe (per non spammare)
    if (rowIdx === 0 || rowIdx % 5 === 0) {
      console.log(
        `  [MAP] Riga ${rowIdx.toString().padStart(2)}: date="${date}" dow="${dayOfWeek}" orario="${orario}" hOrd="${hOrd}" hEcc="${hEcc}" timbrature="${timbrature}" giust=[${giustificativi.map((g) => g.text).join("|")}]`,
      );
    }

    return {
      date,
      dayOfWeek,
      timbrature,
      hOrd,
      hEcc,
      orario,
      giustificativi,
      richieste,
      warnings: [],
    };
  });

  const daysWithData = results.filter((d) => d.date);
  console.log(
    `  [MAP] Giorni mappati con DATA valorizzata: ${daysWithData.length} / ${results.length}`,
  );
  console.log(
    `  [MAP] Range date: ${daysWithData[0]?.date ?? "n/a"} → ${daysWithData.at(-1)?.date ?? "n/a"}`,
  );

  return results;
}
