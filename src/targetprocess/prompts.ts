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

    return `Analyze this batch of TargetProcess tasks.
For each task, return a JSON object in an array.

REQUIRED STRUCTURE:
{
  "results": [
    {
      "id": number,
      "summary": "Overall technical summary in 3-4 sentences",
      "tags": ["tag1", "tag2", "tag3"],
      "stakeholders": ["Stakeholder1", "Stakeholder2"],
      "userActivities": {
        "UserName": "Specific summary of the user's contribution based on their activity logs"
      }
    }
  ]
}

RULES:

1. Tags must be at least 10 and include recurring terms, technologies, modules, activity types, and processes.
2. In 'userActivities', create a one-sentence summary for each user who logged hours, explaining their specific contribution.
3. If a user logged hours but the descriptions are generic, infer the contribution from the context of the task.
4. All the output must be in ENG in the specified JSON format without any additional text.

BATCH DATA:
${formattedItems}`;
  },
};
