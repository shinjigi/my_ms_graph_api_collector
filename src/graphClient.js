const fs = require("fs");
const path = require("path");
const { PublicClientApplication } = require("@azure/msal-node");
const { Client } = require("@microsoft/microsoft-graph-client");
require("isomorphic-fetch");

const config = require("./config");

const TOKEN_CACHE_PATH = path.join(process.cwd(), ".token-cache.json");

const cachePlugin = {
  beforeCacheAccess: async (cacheContext) => {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      cacheContext.tokenCache.deserialize(
        fs.readFileSync(TOKEN_CACHE_PATH, "utf-8")
      );
    }
  },
  afterCacheAccess: async (cacheContext) => {
    if (cacheContext.cacheHasChanged) {
      fs.writeFileSync(
        TOKEN_CACHE_PATH,
        cacheContext.tokenCache.serialize(),
        "utf-8"
      );
    }
  }
};

const msalClient = new PublicClientApplication({
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`
  },
  cache: { cachePlugin }
});

async function getAccessToken() {
  const accounts = await msalClient.getTokenCache().getAllAccounts();

  if (accounts.length > 0) {
    try {
      const result = await msalClient.acquireTokenSilent({
        account: accounts[0],
        scopes: config.scopes
      });
      if (result && result.accessToken) {
        return result.accessToken;
      }
    } catch {
      // Silent acquisition failed, fall through to device code
    }
  }

  const result = await msalClient.acquireTokenByDeviceCode({
    scopes: config.scopes,
    deviceCodeCallback: (response) => {
      console.log(response.message);
    }
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
