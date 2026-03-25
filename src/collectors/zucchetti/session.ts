import "dotenv/config";
import { chromium, Browser, BrowserContext, Page } from "playwright";
import { createLogger } from "../../logger";

const log = createLogger("zucchetti-session");

export interface ZucchettiSession {
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cookies: string;
  m_cCheck: string;
  idCompany: string;
  idEmploy: string;
  baseUrl: string;
}

/**
 * Centra la logica di login e inizializzazione sessione per Zucchetti.
 * Restituisce sia gli oggetti Playwright (per automazione DOM)
 * che i token per chiamate API dirette.
 */
/**
 * Resolve headless mode: explicit param > env var ZUCCHETTI_HEADLESS > default true.
 */
function resolveHeadless(explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  const env = process.env.ZUCCHETTI_HEADLESS;
  if (env !== undefined) return env === "true" || env === "1";
  return true;
}

export async function startZucchettiSession(
  headless?: boolean,
): Promise<ZucchettiSession> {
  headless = resolveHeadless(headless);
  const baseUrl = "https://saas.hrzucchetti.it";
  const username = process.env.ZUCCHETTI_USERNAME;
  const password = process.env.ZUCCHETTI_PASSWORD;

  log.info(`headless=${headless}`);
  log.info(
    `ZUCCHETTI_USERNAME=${username ? `"${username}"` : "⚠️  NON IMPOSTATO"}`,
  );
  log.info(
    `ZUCCHETTI_PASSWORD=${password ? `"${"*".repeat(password.length)}"` : "⚠️  NON IMPOSTATO"}`,
  );

  if (!username || !password) {
    throw new Error(
      "ZUCCHETTI_USERNAME o ZUCCHETTI_PASSWORD non configurati nel .env",
    );
  }

  log.info("Avvio browser Chromium...");
  const browser = await chromium.launch({ headless });
  const context = await browser.newContext();
  const page = await context.newPage();

  // ── 1. Navigazione alla home ─────────────────────────────────────────────
  const homeUrl = `${baseUrl}/hrpzcs01/jsp/home.jsp`;
  log.info(`Navigazione a: ${homeUrl}`);
  const homeResponse = await page.goto(homeUrl);
  log.info(`home.jsp → status=${homeResponse?.status()} url=${page.url()}`);

  // ── 2. Popup "Comunicazioni" ─────────────────────────────────────────────
  log.info("Controllo popup iniziale...");
  try {
    const popupCloseButton = page.locator('[id^="spModalLayer_closebtn"]');
    await popupCloseButton.waitFor({ state: "visible", timeout: 3000 });
    log.info("Popup trovato, chiusura in corso...");
    await popupCloseButton.click();
    log.info("Popup chiuso.");
  } catch (_e) {
    log.info("Nessun popup trovato (o timeout 3s) – ok.");
  }

  // ── 3. Ricerca campi login ───────────────────────────────────────────────
  const loginSelector =
    'input[placeholder="Username"], input[name*="UserName"]';
  log.info(`Attesa selettore login: ${loginSelector}`);
  try {
    await page.waitForSelector(loginSelector, {
      state: "visible",
      timeout: 15000,
    });
    log.info(`Campo username trovato. URL corrente: ${page.url()}`);
  } catch (e) {
    log.error(`❌ Campo username NON trovato entro 15s. URL: ${page.url()}`);
    // Dump titolo e snippet HTML per capire dove siamo
    const title = await page.title();
    const bodySnippet = await page.evaluate(
      () => document.body?.innerHTML?.slice(0, 500) || "(body vuoto)",
    );
    log.error(`Titolo pagina: "${title}"`);
    log.error(`HTML snippet:\n${bodySnippet}`);
    throw e;
  }

  // ── 4. Fill credenziali ──────────────────────────────────────────────────
  await page
    .locator('input[placeholder="Username"], input[name*="UserName"]')
    .first()
    .fill(username);
  await page
    .locator('input[placeholder="Password"], input[type="password"]')
    .first()
    .fill(password);
  log.info("Credenziali inserite. Invio login...");

  // ── 5. Submit ────────────────────────────────────────────────────────────
  const [navResponse] = await Promise.all([
    page.waitForNavigation({ waitUntil: "networkidle" }),
    page
      .locator('button, input[type="submit"]')
      .filter({ hasText: /Login|Accedi/i })
      .first()
      .click(),
  ]);
  log.info(`Dopo login: status=${navResponse?.status()} url=${page.url()}`);

  // Verifica che non siamo ancora sulla pagina di login (errore credenziali)
  const currentUrl = page.url();
  if (currentUrl.includes("home.jsp") || currentUrl.includes("login")) {
    const errorText = await page.evaluate(() => {
      const el = document.querySelector(
        '.error, .alert, [class*="error"], [class*="alert"]',
      );
      return el?.textContent?.trim() || null;
    });
    if (errorText) {
      log.error(`❌ Possibile errore di login rilevato: "${errorText}"`);
    } else {
      log.warn(
        `⚠️  URL post-login ancora su home/login – potrebbe essere normale o errore silenzioso.`,
      );
    }
  }

  // ── 6. Navigazione al Cartellino ────────────────────────────────────────
  log.info("Inizializzazione contesto API (apertura Cartellino)...");
  log.info('Attesa link "Servizi aggiuntivi"...');
  try {
    await page.waitForSelector('a[title="Servizi aggiuntivi"]', {
      state: "visible",
      timeout: 15000,
    });
    log.info('Link "Servizi aggiuntivi" trovato.');
  } catch (e) {
    log.error(`❌ Link "Servizi aggiuntivi" NON trovato. URL: ${page.url()}`);
    const title = await page.title();
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a"))
        .map((a) => `[${a.title || a.textContent?.trim()}] → ${a.href}`)
        .slice(0, 20)
        .join("\n"),
    );
    log.error(`Titolo: "${title}"\n  Link disponibili (primis 20):\n${links}`);
    throw e;
  }
  await page.click('a[title="Servizi aggiuntivi"]');
  log.info('Click "Servizi aggiuntivi" eseguito.');

  // ── 7. Apertura nuova tab Cartellino ─────────────────────────────────────
  log.info("Attesa apertura nuova pagina (Cartellino Mensile)...");
  let timesheetPage: Page;
  try {
    [timesheetPage] = await Promise.all([
      context.waitForEvent("page", { timeout: 15000 }),
      page.getByText("Cartellino Mensile", { exact: false }).click(),
    ]);
    log.info(`Nuova pagina aperta: ${timesheetPage.url()}`);
  } catch (e) {
    log.error("❌ Impossibile aprire la pagina del Cartellino.");
    // Cerca il testo nell'eventuale menu espanso
    const menuText = await page.evaluate(() =>
      document.body?.innerText?.slice(0, 500),
    );
    log.error(`Testo visibile nel menu:\n${menuText}`);
    throw e;
  }

  // ── 8. Attesa caricamento Cartellino ─────────────────────────────────────
  log.info("Attesa networkidle su pagina Cartellino...");
  await timesheetPage.waitForLoadState("networkidle");
  log.info(`URL Cartellino dopo networkidle: ${timesheetPage.url()}`);

  log.info("Attesa scomparsa spinner #rif_mbbody (timeout 30s)...");
  try {
    await timesheetPage
      .locator("#rif_mbbody")
      .waitFor({ state: "detached", timeout: 30000 });
    log.info("Spinner #rif_mbbody scomparso. Pagina pronta.");
  } catch (_e) {
    log.warn("⚠️  #rif_mbbody non è scomparso entro 30s – continuo comunque.");
  }
  log.debug("Dump window completo (filtrato)...");

  const debugData = await timesheetPage.evaluate(() => {
    const result: Record<string, unknown> = {};
    const win = window as unknown as Record<string, unknown>;

    for (const key in window) {
      try {
        const lower = key.toLowerCase();

        if (
          lower.includes("ctx") ||
          lower.includes("company") ||
          lower.includes("employ") ||
          lower.includes("check") ||
          lower.includes("id")
        ) {
          const val = win[key];

          if (typeof val === "object") {
            result[key] = JSON.stringify(val, null, 2);
          } else {
            result[key] = val;
          }
        }
      } catch (_e) {
        // property access on window[key] may throw — skip silently
      }
    }

    return result;
  });

  log.debug("WINDOW VARS:", debugData);

  // ── 9. Estrazione token ──────────────────────────────────────────────────
  log.info("Estrazione variabili globali JS dalla pagina...");
  const rawCtx = await timesheetPage.evaluate(() => {
    return (globalThis as any).m_Ctx || {};
  });

  const str = (v: any) => (v != null ? String(v) : "");
  const idCompany = str(rawCtx.idAzienda || rawCtx.IDCOMPANY || rawCtx.company);
  const idEmploy = str(rawCtx.idDipendente || rawCtx.IDEMPLOY || rawCtx.employ);
  const m_cCheck = str(rawCtx.check || rawCtx.m_cCheck);

  log.info(`idCompany="${idCompany}" ${idCompany ? "✅" : "⚠️  VUOTO"}`);
  log.info(`idEmploy="${idEmploy}" ${idEmploy ? "✅" : "⚠️  VUOTO"}`);
  log.info(`m_cCheck="${m_cCheck}" ${m_cCheck ? "✅" : "⚠️  VUOTO"}`);

  if (!idCompany || !idEmploy || !m_cCheck) {
    // Dump di tutte le proprietà window custom per capire quali nomi usa Zucchetti
    const windowVars = await timesheetPage.evaluate(() => {
      const base = Object.keys(globalThis);
      return base.filter(
        (k) =>
          k.startsWith("g_") ||
          k.startsWith("m_") ||
          k.toLowerCase().includes("company") ||
          k.toLowerCase().includes("employ") ||
          k.toLowerCase().includes("check"),
      );
    });
    log.warn(
      `⚠️  Variabili window rilevanti trovate: ${JSON.stringify(windowVars)}`,
    );
  }

  // ── 10. Cookies ──────────────────────────────────────────────────────────
  const cookiesArray = await context.cookies();
  const cookies = cookiesArray.map((c) => `${c.name}=${c.value}`).join("; ");
  log.info(`Cookie estratti: ${cookiesArray.length} cookie`);
  log.info(`Nomi cookie: [${cookiesArray.map((c) => c.name).join(", ")}]`);
  log.info("Sessione inizializzata con successo ✅");

  return {
    browser,
    context,
    page: timesheetPage,
    cookies,
    m_cCheck,
    idCompany,
    idEmploy,
    baseUrl,
  };
}
