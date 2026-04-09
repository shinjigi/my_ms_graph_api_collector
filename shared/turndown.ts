import TurndownService from "turndown";

// Inizializza Turndown fuori dalla funzione per riutilizzarlo
export const turndownService = new TurndownService({
    headingStyle: "atx", // Usa # invece del sottolineato per gli h1
    codeBlockStyle: "fenced", // Usa ``` per i blocchi di codice
    emDelimiter: "*", // Usa * per il corsivo
});

// Opzionale: Evita di convertire tag che vuoi ignorare o mantieni pulito l'output
turndownService.addRule("ignore-styles", {
    filter: ["style", "script", "head"],
    replacement: () => "",
});

// Regola per rimuovere i link di Teams, i loghi e i tracking pixel
turndownService.addRule('remove-teams-garbage', {
    filter: (node) => {
        const text = (node.textContent || '').trim();
        const href = node.getAttribute('href') || '';
        
        // 1. Rimuovi link che puntano a Teams o aka.ms
        if (node.nodeName === 'A' && (href.includes('teams.microsoft.com') || href.includes('aka.ms'))) return true;
        
        // 2. Rimuovi immagini (loghi, icone, tracker)
        if (node.nodeName === 'IMG') return true;
        
        // 3. Rimuovi link alle opzioni del meeting o privacy
        if (href.includes('meetingOptions') || href.includes('privacy-policy') || href.includes('dialin.teams.microsoft.com')) return true;

        // 4. Rimuovi blocchi di testo tipici di Teams
        // EVITIAMO di rimuovere nodi troppo grandi (potrebbero essere contenitori dell'intero messaggio)
        if (text.length > 300) return false;

        const garbagePatterns = [
            "Join the meeting now",
            "Meeting ID:",
            "Passcode:",
            "Dial in by phone",
            "Phone conference ID:",
            "Find a local number",
            "Reset dial-in PIN",
            "CONFIDENTIALITY NOTICE"
        ];
        
        if (garbagePatterns.some(p => text.includes(p))) return true;

        // 5. Rimuovi linee di separazione (underscore o trattini lunghi)
        if (/^[_\- ]{10,}$/.test(text)) return true;

        return false;
    },
    replacement: () => '' // Elimina completamente il contenuto
});

export function cleanTeamsGarbage(html: string): string {
    if (!html) return "";

    // 1. Identifica i pattern tipici degli inviti Teams per il troncamento
    const teamsMarkers = [
        "________________________________________________________________________________",
        "--------------------------------------------------------------------------------",
        "Microsoft Teams Need help?",
        "Join the meeting now",
        "CONFIDENTIALITY NOTICE",
        "**Microsoft Teams**"
    ];

    let cleanHtml = html;
    
    // Proviamo a tagliare l'HTML alla prima occorrenza di un footer Teams noto
    for (const marker of teamsMarkers) {
        const index = cleanHtml.indexOf(marker);
        if (index !== -1) {
            // Se troviamo il marker, tagliamo tutto quello che segue
            cleanHtml = cleanHtml.substring(0, index);
        }
    }

    // Rimuoviamo eventuali righe vuote o spazi in eccesso derivanti dai tag rimossi
    return cleanHtml.trim();
}