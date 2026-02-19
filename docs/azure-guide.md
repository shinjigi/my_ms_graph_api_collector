# Guida alla Navigazione Azure per MS Graph

Se la tua azienda ha una grossa infrastruttura Azure, è normale trovarsi smarriti tra decine di tenant e subscription. Ecco come identificare l'ambiente corretto per questo progetto.

## 1. Identificare i Tenant

Il comando `az account tenant list` richiede un'estensione che potrebbe fallire l'installazione dietro proxy. Usa invece questo comando **core** che elenca tutte le tue sottoscrizioni e i relativi Tenant ID:

```powershell
az account list --all --output table
```

Cerca la colonna `TenantId`. Se hai accesso a più tenant, vedrai più righe. Identifica quello che corrisponde alla tua licenza Microsoft 365.

> **Risultato verificato (2026-02-19):** Tutte le sottoscrizioni appartengono a un unico tenant: `<*-tenant-id>`.

## 2. Effettuare il Login nel Tenant Corretto

Una volta trovato il `TenantId` giusto, forza il login su quello specifico tenant:

```powershell
az login --tenant <IL_TUO_TENANT_ID>
```

Nel nostro caso:

```powershell
az login --tenant <*-tenant-id>
```

## 3. Identificare la Sottoscrizione (Opzionale)

Se hai più sottoscrizioni all'interno del tenant, puoi vederle con:

```powershell
az account list --output table
```

Seleziona quella predefinita (se necessario):

```powershell
az account set --subscription "<NOME_O_ID_SUBSCRIPTION>"
```

## 4. Creare o Trovare l'App Registration

Per leggere i dati Graph, serve una "App Registration" in **Microsoft Entra ID** (ex Azure AD).

Il progetto usa il **device code flow** (`PublicClientApplication` di MSAL) con permessi di tipo **Delegated**. Questo significa che:
- **NON serve un client secret** (è più sicuro così)
- Non serve un `GRAPH_USER_ID` (l'app usa l'endpoint `/me` dell'utente loggato)
- L'utente si autentica inserendo un codice nel browser

### Permessi necessari (Delegated)

| Permesso | Tipo | Uso |
|---|---|---|
| `Mail.Read` | Delegated | Lettura email dell'utente |
| `Calendars.Read` | Delegated | Lettura calendario dell'utente |
| `Chat.Read` | Delegated | Lettura chat Teams dell'utente |

### Creare una nuova app

1. Vai su [Azure Portal](https://portal.azure.com).
2. Cerca **Microsoft Entra ID** -> **App registrations**.
3. Se ne hai già una, prendi l'`Application (client) ID`.
4. Se devi crearla:
   - **New registration**.
   - Nome: `MyGraphCollector`.
   - Supported account types: **Accounts in this organizational directory only**.
   - **API Permissions**: Aggiungi `Mail.Read`, `Calendars.Read`, `Chat.Read` (tipo **Delegated**, non Application).
   - Non serve fare "Grant admin consent" per questi permessi Delegated.
5. In **Authentication**:
   - Abilita **"Allow public client flows"** (necessario per il device code flow).

## Troubleshooting: Errori SSL/Proxy

Se ricevi errori `CERTIFICATE_VERIFY_FAILED`, la tua rete aziendale sta intercettando il traffico (proxy con certificato self-signed).

### Soluzione 1: Usa il Bundle Aziendale

```powershell
$env:REQUESTS_CA_BUNDLE = ".\my_ms_graph_api_collector\corporate-bundle.pem"
```

> **Nota (2026-02-19):** `REQUESTS_CA_BUNDLE` da solo **non è sufficiente** per i comandi `az ad` che usano l'SDK Python internamente. Funziona per `az account list` e comandi core, ma non per le chiamate a `graph.microsoft.com`.

### Soluzione 2: Disabilita Verifica SSL (Temporaneo)

Per i comandi `az ad` (che interrogano `graph.microsoft.com`), serve la variabile d'ambiente specifica:

```powershell
# PowerShell
$env:AZURE_CLI_DISABLE_CONNECTION_VERIFICATION = 1
```

```bash
# Bash / Git Bash
export AZURE_CLI_DISABLE_CONNECTION_VERIFICATION=1
```

> **Attenzione:** Questa impostazione disabilita completamente la verifica SSL per Azure CLI. Usala solo in ambienti di sviluppo dietro proxy aziendali. Il flag `az config set core.no_verify_ssl=true` da solo **non basta** per i comandi `az ad`.

## 5. Configurare il Progetto

Usa lo script `scripts/bootstrap-env.ps1` per generare il file `.env`:

```powershell
pwsh ./scripts/bootstrap-env.ps1 `
  -AppObjectId "<IL_TUO_APP_ID>"
```

### Valori per il file `.env`

```
TENANT_ID=<*-tenant-id>
CLIENT_ID=<appId dell'App Registration>
TOP=25
```

## 6. Esecuzione

```powershell
npm start
```

Al primo avvio, il programma mostrerà un URL e un codice da inserire nel browser per autenticarsi. Alle esecuzioni successive, il token verrà rinnovato automaticamente dalla cache (`.token-cache.json`).
