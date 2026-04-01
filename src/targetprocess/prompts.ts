import { TpOpenItem, TpUserStat, TpTimeEntry } from "@shared/targetprocess";

/**
 * Collezione di prompt per Gemini per l'analisi dei task e dei log
 */
export const AnalysisPrompts = {
  /**
   * Genera il prompt per un batch di task.
   * Include descrizioni, statistiche e log grezzi per ogni utente.
   */
  getBatchAnalysisPrompt(
    itemsData: Array<{
      item: TpOpenItem;
      stats: TpUserStat[];
      logs: TpTimeEntry[];
    }>,
  ): string {
    const formattedItems = itemsData
      .map(({ item, stats, logs }) => {
        // Raggruppiamo i log per utente per permettere a Gemini di riassumere le attività individuali
        const logsByUser: Record<string, string[]> = {};
        logs.forEach((l) => {
          const user = l.User?.FullName || "Unknown";
          if (!logsByUser[user]) logsByUser[user] = [];
          if (l.Description) logsByUser[user].push(l.Description);
        });

        const userWorkDetail = Object.entries(logsByUser)
          .map(([user, descList]) => {
            const stat = stats.find((s) => s.userName === user);
            return `Utente: ${user} (${stat?.totalHours || 0}h)
Log Descrizioni:
- ${descList.join("\n- ")}`;
          })
          .join("\n\n");

        return `--- TASK ID: #${item.id} ---
Titolo: ${item.name}
Creatore: ${item.owner || "N/A"}
Assegnatari: ${item.assignments?.join(", ") || "Nessuno"}
Progetto: ${item.projectName}
Stato: ${item.stateName}
Descrizione Task: "${item.description || "Nessuna"}"

STORICO ATTIVITÀ UTENTI:
${userWorkDetail || "Nessun log presente."}
`;
      })
      .join("\n\n================================\n\n");

    return `Analizza questo batch di task di TargetProcess.
Per ogni task, restituisci un oggetto JSON all'interno di un array.

STRUTTURA RICHIESTA:
{
  "results": [
    {
      "id": number,
      "summary": "Riassunto tecnico complessivo di 3-4 frasi",
      "tags": ["tag1", "tag2", "tag3"],
      "stakeholders": ["Stakeholder1", "Stakeholder2"],
      "userActivities": {
         "Nome Utente": "Riassunto specifico di cosa ha fatto questa persona basandoti sui suoi log"
      }
    }
  ]
}

REGOLE:
1. I tag devono essere almeno 10 ed includere termini ricorrenti, tecnologie, moduli, tipo di attività, processi.
2. In 'userActivities', crea un riassunto di 1 frase per ogni utente che ha loggato ore, spiegando il suo contributo specifico.
3. Se un utente ha loggato ore ma le descrizioni sono generiche, deduci il contributo dal contesto del task.

DATI BATCH:
${formattedItems}`;
  },
};
