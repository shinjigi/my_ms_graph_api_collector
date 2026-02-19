# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Run**: `npm start` (executes `node src/index.js`)
- **Syntax check**: `npm run check` (executes `node --check src/index.js`)
- No test framework or linter is configured.

## Architecture

Node.js (CommonJS) app that collects data from Microsoft Graph API using the **device code flow** (delegated permissions) and saves JSON files to `data/`.

### Auth flow

`graphClient.js` uses MSAL's `PublicClientApplication` with a file-based token cache (`.token-cache.json`). On first run, it prompts the user to authenticate via device code (URL + code in browser). Subsequent runs use `acquireTokenSilent` with the cached refresh token.

### Data flow

```
index.js  →  graphClient.js (auth + Graph client)
          →  collectors.js  (3 collectors, all use /me/ endpoints)
          →  data/*.json     (output)
```

- `config.js` — loads `.env`, validates required vars (`TENANT_ID`, `CLIENT_ID`), exports config including delegated scopes (`Mail.Read`, `Calendars.Read`, `Chat.Read`)
- `graphClient.js` — MSAL device code auth with token cache, creates `@microsoft/microsoft-graph-client` instance
- `collectors.js` — `collectEmails`, `collectCalendarEvents`, `collectTeamsChats`; each calls `/me/...` endpoints and writes to `data/`
- `index.js` — entrypoint, runs all three collectors sequentially

### Setup helper

`scripts/bootstrap-env.ps1` — PowerShell script that uses Azure CLI to generate `.env` from an App Registration Object ID. See `docs/azure-guide.md` for Azure portal setup and SSL/proxy troubleshooting.

## Key conventions

- Language in code comments and console output is **Italian**.
- The app requires an Azure Entra ID App Registration with **"Allow public client flows"** enabled and **Delegated** permissions (not Application).
- `.token-cache.json` contains sensitive tokens and is gitignored.
- The `corporate-bundle.pem` file at the repo root is for corporate proxy environments (SSL interception).
