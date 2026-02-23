const fs = require("fs/promises");
const path = require("path");

const config = require("./config");
const outputDir = path.join(process.cwd(), "data");

async function saveJson(filename, payload) {
  await fs.mkdir(outputDir, { recursive: true });
  const outPath = path.join(outputDir, filename);
  await fs.writeFile(outPath, JSON.stringify(payload, null, 2), "utf-8");
  return outPath;
}

async function collectEmails(client) {
  const response = await client
    .api("/me/messages")
    .select("id,subject,from,receivedDateTime,bodyPreview,webLink")
    .orderby("receivedDateTime desc")
    .top(config.top)
    .get();

  return saveJson("emails.json", response.value || []);
}

async function collectCalendarEvents(client) {
  const response = await client
    .api("/me/events")
    .select("id,subject,start,end,organizer,location,webLink")
    .orderby("start/dateTime")
    .top(config.top)
    .get();

  return saveJson("calendar-events.json", response.value || []);
}

async function collectTeamsChats(client) {
  const chatsResponse = await client
    .api("/me/chats")
    .select("id,topic,chatType,lastUpdatedDateTime")
    .top(config.top)
    .get();

  const chats = chatsResponse.value || [];
  const messagesByChat = [];

  for (const chat of chats) {
    // Chiamata senza .select() per evitare l'errore
    const messagesResponse = await client
      .api(`/me/chats/${chat.id}/messages`)
      .top(Math.min(config.top, 20))
      .get();

    // FILTRAGGIO MANUALE: Selezioniamo solo i campi che ci servono qui
    const simplifiedMessages = (messagesResponse.value || []).map(m => ({
      id: m.id,
      createdDateTime: m.createdDateTime,
      lastModifiedDateTime: m.lastModifiedDateTime,
      from: m.from,
      body: m.body,
      webUrl: m.webUrl
    }));

    messagesByChat.push({
      chat,
      messages: simplifiedMessages
    });
  }

  return saveJson("teams-messages.json", messagesByChat);
}

module.exports = {
  collectEmails,
  collectCalendarEvents,
  collectTeamsChats
};
