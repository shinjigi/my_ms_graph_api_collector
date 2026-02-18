const { createGraphClient } = require("./graphClient");
const {
  collectEmails,
  collectCalendarEvents,
  collectTeamsChats
} = require("./collectors");

async function run() {
  console.log("Avvio raccolta dati Microsoft Graph...");
  const client = await createGraphClient();

  const emailPath = await collectEmails(client);
  console.log(`Email salvate in: ${emailPath}`);

  const calendarPath = await collectCalendarEvents(client);
  console.log(`Eventi calendario salvati in: ${calendarPath}`);

  const teamsPath = await collectTeamsChats(client);
  console.log(`Messaggi Teams salvati in: ${teamsPath}`);

  console.log("Raccolta completata ✅");
}

run().catch((error) => {
  console.error("Errore durante la raccolta:", error.message);
  process.exit(1);
});
