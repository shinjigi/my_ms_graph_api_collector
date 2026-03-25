import { ZucchettiSession } from "./session";
import { createLogger } from "../../logger";

const log = createLogger("zucchetti-api");

export interface ZucchettiApiRawResponse {
  Fields: string[];
  Data: unknown[][];
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

  log.info("── fetchZucchettiTimesheet ──");
  log.info(`URL: ${url}`);
  log.info(`Params:
    rows=300, startrow=0, count=false
    sqlcmd=rows:hfpr_fcartellino3
    IDCOMPANY="${session.idCompany}" ${session.idCompany ? "✅" : "⚠️  VUOTO"}
    IDEMPLOY="${session.idEmploy}"   ${session.idEmploy ? "✅" : "⚠️  VUOTO"}
    Anno="${year}" Mese="${month}"
    m_cCheck="${session.m_cCheck}"  ${session.m_cCheck ? "✅" : "⚠️  VUOTO"}
    isclientdb=false, Visualiz='', LaFlexi=N, HHMM=N`);
  log.info(
    `Cookie header (primi 200 char): ${session.cookies.slice(0, 200)}...`,
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
    log.error(
      `❌ Errore di rete durante fetch: ${(fetchErr as Error).message}`,
    );
    throw fetchErr;
  }

  log.info(
    `Response: status=${response.status} statusText="${response.statusText}"`,
  );
  log.info(`Content-Type: ${response.headers.get("content-type")}`);

  if (!response.ok) {
    const body = await response
      .text()
      .catch(() => "(impossibile leggere body)");
    log.error(
      `❌ HTTP ${response.status} – body (primi 500 char):\n${body.slice(0, 500)}`,
    );
    throw new Error(
      `Zucchetti API error: ${response.status} – ${body.slice(0, 200)}`,
    );
  }

  const responseText = await response.text();
  log.info(
    `Response body (primi 300 char): ${responseText.slice(0, 300)}`,
  );

  let parsed: ZucchettiApiRawResponse;
  try {
    parsed = JSON.parse(responseText) as ZucchettiApiRawResponse;
  } catch (jsonErr) {
    log.error(
      `❌ Risposta non è JSON valido. Body completo:\n${responseText.slice(0, 1000)}`,
    );
    throw new Error(
      `Zucchetti: risposta non JSON – ${(jsonErr as Error).message}`,
      { cause: jsonErr },
    );
  }

  const fields = parsed.Fields ?? [];
  const data = parsed.Data ?? [];
  log.info(
    `Fields ricevuti (${fields.length}): [${fields.join(", ")}]`,
  );
  log.info(`Righe dati ricevute: ${data.length}`);

  if (data.length > 0) {
    log.info(`Prima riga (campione): ${JSON.stringify(data[0])}`);
  } else {
    log.warn("⚠️  Nessuna riga dati ricevuta! Possibili cause:");
    log.warn("   - m_cCheck non valido o sessione scaduta");
    log.warn("   - IDCOMPANY / IDEMPLOY errati o vuoti");
    log.warn("   - Anno/Mese fuori range o non autorizzati");
    log.warn("   - sqlcmd errato per questa versione di Zucchetti");
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
    log.warn(
      `⚠️  Campi ATTESI ma NON trovati nella risposta: [${missingFields.join(", ")}]`,
    );
    log.warn(
      `   Campi effettivamente presenti: [${fields.join(", ")}]`,
    );
  } else {
    log.info("Tutti i campi attesi sono presenti ✅");
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

  log.info("── mapRawToZucchettiDays ──");
  log.info(`Fields: [${Fields.join(", ")}]`);
  log.info(`Righe da mappare: ${Data.length}`);

  if (Data.length === 0) {
    log.warn(
      "⚠️  Nessuna riga da mappare – output sarà un array vuoto.",
    );
    return [];
  }

  const results = Data.map((row, rowIdx) => {
    const getField = (name: string) => {
      const idx = Fields.indexOf(name);
      if (idx === -1 && rowIdx === 0) {
        log.warn(
          `⚠️  Campo "${name}" non trovato nei Fields (riga ${rowIdx})`,
        );
      }
      return idx !== -1 ? String(row[idx] ?? "") : "";
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
      log.info(
        `Riga ${rowIdx.toString().padStart(2)}: date="${date}" dow="${dayOfWeek}" orario="${orario}" hOrd="${hOrd}" hEcc="${hEcc}" timbrature="${timbrature}" giust=[${giustificativi.map((g) => g.text).join("|")}]`,
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
  log.info(
    `Giorni mappati con DATA valorizzata: ${daysWithData.length} / ${results.length}`,
  );
  log.info(
    `Range date: ${daysWithData[0]?.date ?? "n/a"} → ${daysWithData.at(-1)?.date ?? "n/a"}`,
  );

  return results;
}
