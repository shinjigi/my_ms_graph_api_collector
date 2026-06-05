import * as fs from "node:fs";
import * as path from "node:path";
import {
  InteractiveBrowserCredential,
  useIdentityPlugin,
  type AuthenticationRecord,
} from "@azure/identity";
import { cachePersistencePlugin } from "@azure/identity-cache-persistence";
import { Client } from "@microsoft/microsoft-graph-client";
import { TokenCredentialAuthenticationProvider } from "@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials/index.js";
import "isomorphic-fetch";
import { config } from "./config";
import { createLogger } from "./logger";

const log = createLogger("graph-client");

// Token segreti (access/refresh) in cache cifrata dal SO (DPAPI su Windows),
// gestita dal plugin di persistenza. L'AuthenticationRecord qui sotto contiene
// solo metadati NON segreti (home account id) usati per il login silenzioso.
const AUTH_RECORD_PATH = path.join(process.cwd(), ".auth-record.json");
const TOKEN_CACHE_NAME = "mygraphcollector";

useIdentityPlugin(cachePersistencePlugin);

// Scope delegati richiesti, qualificati con la risorsa Graph (consenso dinamico).
const graphScopes = config.scopes.map(
  (scope) => `https://graph.microsoft.com/${scope}`,
);

function loadAuthRecord(): AuthenticationRecord | undefined {
  if (!fs.existsSync(AUTH_RECORD_PATH)) return undefined;
  try {
    return JSON.parse(fs.readFileSync(AUTH_RECORD_PATH, "utf-8")) as AuthenticationRecord;
  } catch {
    // Record corrotto: lo ignoriamo, ripartirà il login interattivo.
    return undefined;
  }
}

function saveAuthRecord(record: AuthenticationRecord): void {
  fs.writeFileSync(AUTH_RECORD_PATH, JSON.stringify(record), "utf-8");
}

function buildCredential(
  authenticationRecord?: AuthenticationRecord,
): InteractiveBrowserCredential {
  return new InteractiveBrowserCredential({
    tenantId: config.tenantId,
    clientId: config.clientId,
    // Redirect su loopback: la libreria sceglie una porta libera a runtime.
    // In Azure è registrato "http://localhost" (la porta è ignorata nel match).
    redirectUri: "http://localhost",
    tokenCachePersistenceOptions: { enabled: true, name: TOKEN_CACHE_NAME },
    authenticationRecord,
  });
}

async function createCredential(): Promise<InteractiveBrowserCredential> {
  const existingRecord = loadAuthRecord();
  const credential = buildCredential(existingRecord);

  if (existingRecord) {
    // Già autenticato in passato: la cache cifrata ha il refresh token,
    // i prossimi getToken sono silenziosi (nessun browser).
    return credential;
  }

  // Primo avvio: apre il browser sul PC locale (Authorization Code + PKCE).
  log.info("Primo accesso: apertura browser per il login a Microsoft 365...");
  const record = await credential.authenticate(graphScopes);
  if (record) {
    saveAuthRecord(record);
    log.info("Login completato, sessione salvata per i prossimi avvii.");
  }
  return credential;
}

export async function createGraphClient(): Promise<Client> {
  const credential = await createCredential();

  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: graphScopes,
  });

  return Client.initWithMiddleware({ authProvider });
}
