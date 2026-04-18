import TurndownService from "turndown";
import { JSDOM } from "jsdom";
import { createLogger } from "../src/logger";

const log = createLogger("turndown");

/**
 * Inizializza Turndown con opzioni ottimizzate per la leggibilità.
 */
export const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  emDelimiter: "*",
});

// Regola per rimuovere tag tecnici che sporcano il Markdown
turndownService.addRule("ignore-styles", {
  filter: ["style", "script", "head", "meta", "title", "link"],
  replacement: () => "",
});

// Regola per rimuovere i link di Teams, i loghi e i tracking pixel
turndownService.addRule("remove-teams-garbage", {
  filter: (node) => {
    const nodeName = node.nodeName;
    const href = (node as HTMLElement).getAttribute?.("href") || "";

    // 1. Rimuovi link che puntano a infrastruttura meeting
    if (
      nodeName === "A" &&
      (href.includes("teams.microsoft.com") ||
        href.includes("aka.ms") ||
        href.includes("dialin.teams.microsoft.com") ||
        href.includes("meetingOptions") ||
        href.includes("privacy-policy"))
    ) {
      return true;
    }

    // 2. Rimuovi immagini (loghi, icone, tracker pixel)
    if (nodeName === "IMG") return true;

    // 3. Rimuovi link a social (firme)
    const socialPatterns = ["linkedin.com", "twitter.com", "facebook.com", "instagram.com"];
    if (nodeName === "A" && socialPatterns.some((p) => href.includes(p))) {
      return true;
    }

    return false;
  },
  replacement: () => "",
});

/**
 * Pulisce l'HTML operando sul DOM per rimuovere blocchi di "rumore".
 * Tronca il contenuto alla comparsa di firme o inviti a meeting senza distruggere i wrapper.
 */
export function cleanTeamsGarbage(html: string): string {
  if (!html || html.trim() === "") return "";

  const dom = new JSDOM(html);
  const doc = dom.window.document;
  const body = doc.body;

  if (!body) return html;

  // 1. Rimuovi elementi per selettori noti (firme Outlook/Gmail)
  const signatureSelectors = [
    "div#Signature",
    "div#divSignature",
    ".gmail_signature",
    "signature",
  ];
  signatureSelectors.forEach((sel) => {
    doc.querySelectorAll(sel).forEach((el) => el.remove());
  });

  // 2. Troncamento: identifichiamo le parole chiave che segnano l'inizio di un footer o thread
  const footerKeywords = [
    "________________________________________________________________________________",
    "Microsoft Teams",
    "Join the meeting now",
    "Meeting ID:",
    "CONFIDENTIALITY NOTICE",
    "AVVISO DI RISERVATEZZA",
    "Questo messaggio e i suoi allegati",
    "Best regards",
    "Cordiali saluti",
    "Inviato da iPhone",
    "Sent from my iPhone",
    "Da:", 
    "From:",
  ];

  // Usiamo un TreeWalker per trovare il punto di rottura
  const walker = doc.createTreeWalker(body, 1 /* NodeFilter.SHOW_ELEMENT */);
  let currentNode = walker.nextNode();

  while (currentNode) {
    const text = currentNode.textContent || "";
    if (footerKeywords.some((kw) => text.includes(kw)) && text.trim().length < 200) {
      
      // Risaliamo l'albero cancellando solo ciò che viene dopo il match e il match stesso,
      // ma senza rimuovere i genitori che potrebbero contenere il testo precedente (es. WordSection1).
      let p: Node | null = currentNode;
      while (p && p !== body) {
        // Rimuoviamo tutti i fratelli successivi al nodo corrente
        let next = p.nextSibling;
        while (next) {
          const toRemove = next;
          next = next.nextSibling;
          toRemove.remove();
        }
        
        // Rimuoviamo il nodo corrente (che contiene la keyword o è parte del ramo rimosso)
        const parent: Node | null = p.parentNode;
        if (p.parentElement) {
            p.parentElement.removeChild(p as Element);
            log.debug(`Rimosso nodo contenente keyword di footer: <${p.nodeName}> con testo "${text.trim().slice(0, 100)}..."`);
        }
        p = parent;
      }
      break; 
    }
    currentNode = walker.nextNode();
  }

  return body.innerHTML.trim();
}