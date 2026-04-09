import * as fs from "node:fs";
import * as path from "node:path";
import { PublicClientApplication } from "@azure/msal-node";
import type { ICachePlugin, TokenCacheContext } from "@azure/msal-node";
import { Client } from "@microsoft/microsoft-graph-client";
import "isomorphic-fetch";
import { config } from "./config";
import { createLogger } from "./logger";

const log = createLogger("graph-client");

const TOKEN_CACHE_PATH = path.join(process.cwd(), ".token-cache.json");

const cachePlugin: ICachePlugin = {
  beforeCacheAccess: async (ctx: TokenCacheContext) => {
    if (fs.existsSync(TOKEN_CACHE_PATH)) {
      ctx.tokenCache.deserialize(fs.readFileSync(TOKEN_CACHE_PATH, "utf-8"));
    }
  },
  afterCacheAccess: async (ctx: TokenCacheContext) => {
    if (ctx.cacheHasChanged) {
      fs.writeFileSync(TOKEN_CACHE_PATH, ctx.tokenCache.serialize(), "utf-8");
    }
  },
};

const msalClient = new PublicClientApplication({
  auth: {
    clientId: config.clientId,
    authority: `https://login.microsoftonline.com/${config.tenantId}`,
  },
  cache: { cachePlugin },
});

async function getAccessToken(): Promise<string> {
  const accounts = await msalClient.getTokenCache().getAllAccounts();

  if (accounts.length > 0) {
    try {
      const result = await msalClient.acquireTokenSilent({
        account: accounts[0],
        scopes: config.scopes,
      });
      if (result?.accessToken) return result.accessToken;
    } catch {
      // Silent acquisition failed — fall through to device code
    }
  }

  const result = await msalClient.acquireTokenByDeviceCode({
    scopes: config.scopes,
    deviceCodeCallback: (response) => {
      log.info(response.message);
    },
  });

  if (!result?.accessToken) {
    throw new Error("Impossibile ottenere access token da Azure AD.");
  }
  return result.accessToken;
}

export async function createGraphClient(): Promise<Client> {
  // Non chiamiamo getAccessToken qui fuori!
  
  return Client.init({
    // Questa funzione viene eseguita dal Graph Client PRIMA di ogni richiesta API
    authProvider: async (done) => {
      try {
        const token = await getAccessToken(); // MSAL gestisce la cache internamente
        done(null, token);
      } catch (error) {
        done(error as Error, null);
      }
    },
  });
}