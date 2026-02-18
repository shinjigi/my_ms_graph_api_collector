const dotenv = require("dotenv");

dotenv.config();

const required = ["TENANT_ID", "CLIENT_ID", "CLIENT_SECRET", "GRAPH_USER_ID"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Variabile mancante: ${key}. Copia .env.example in .env e valorizzala.`);
  }
}

module.exports = {
  tenantId: process.env.TENANT_ID,
  clientId: process.env.CLIENT_ID,
  clientSecret: process.env.CLIENT_SECRET,
  graphUserId: process.env.GRAPH_USER_ID,
  top: Number(process.env.TOP || 25),
  scopes: ["https://graph.microsoft.com/.default"]
};
