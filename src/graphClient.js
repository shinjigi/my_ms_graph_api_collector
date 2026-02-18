const { ConfidentialClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");

const config = require("./config");

const msalClient = new ConfidentialClientApplication({
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
    clientSecret: config.clientSecret
  }
});

async function getAccessToken() {
  const result = await msalClient.acquireTokenByClientCredential({
    scopes: config.scopes
  });

  if (!result || !result.accessToken) {
    throw new Error("Impossibile ottenere access token da Azure AD.");
  }

  return result.accessToken;
}

async function createGraphClient() {
  const token = await getAccessToken();

  return Client.init({
    authProvider: (done) => {
      done(null, token);
    }
  });
}

module.exports = { createGraphClient };
