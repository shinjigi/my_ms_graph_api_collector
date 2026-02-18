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
    .api(`/users/${config.graphUserId}/messages`)
    .select("id,subject,from,receivedDateTime,bodyPreview,webLink")
    .orderby("receivedDateTime desc")
    .top(config.top)
    .get();

  return saveJson("emails.json", response.value || []);
}

async function collectCalendarEvents(client) {
  const response = await client
    .api(`/users/${config.graphUserId}/events`)
    .select("id,subject,start,end,organizer,location,webLink")
    .orderby("start/dateTime")
    .top(config.top)
    .get();

  return saveJson("calendar-events.json", response.value || []);
}

async function collectTeamsChats(client) {
  const chatsResponse = await client
    .api(`/users/${config.graphUserId}/chats`)
    .select("id,topic,chatType,lastUpdatedDateTime")
    .top(config.top)
    .get();

  const chats = chatsResponse.value || [];

  const messagesByChat = [];
  for (const chat of chats) {
    const messagesResponse = await client
      .api(`/users/${config.graphUserId}/chats/${chat.id}/messages`)
      .select("id,createdDateTime,lastModifiedDateTime,from,body,webUrl")
      .top(Math.min(config.top, 20))
      .get();

    messagesByChat.push({
      chat,
      messages: messagesResponse.value || []
    });
  }

  return saveJson("teams-messages.json", messagesByChat);
}

module.exports = {
  collectEmails,
  collectCalendarEvents,
  collectTeamsChats
};
