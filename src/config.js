const dotenv = require("dotenv");

dotenv.config();

const required = ["TENANT_ID", "CLIENT_ID"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Variabile mancante: ${key}. Copia .env.example in .env e valorizzala.`);
  }
}

module.exports = {
  tenantId: process.env.TENANT_ID,
  clientId: process.env.CLIENT_ID,
  top: Number(process.env.TOP || 25),
  scopes: ["Mail.Read", "Calendars.Read", "Chat.Read"]
};
