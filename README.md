# my_ms_graph_api_collector

Progetto Node.js per leggere e collezionare dati da Microsoft Graph API:
- email (Outlook)
- eventi calendario
- messaggi Teams (chat + messaggi)

## Prerequisiti

1. Node.js 18+
2. App registration su Azure Entra ID con autenticazione **client credentials**
3. Permessi applicativi Graph (con admin consent), ad esempio:
   - `Mail.Read`
   - `Calendars.Read`
   - `Chat.Read.All`
   - `ChatMessage.Read.All`

> Nota: i permessi esatti dipendono dal tenant e dalle policy di sicurezza.

## Setup

```bash
npm install
cp .env.example .env
```

Compila `.env` con i tuoi valori:

```env
TENANT_ID=...
CLIENT_ID=...
GRAPH_USER_ID=utente@tenant.com
TOP=25
```

## Posso popolare `.env` con PowerShell + `az`?

Sì. Ho aggiunto uno script che recupera automaticamente `TENANT_ID`, `CLIENT_ID` e `GRAPH_USER_ID`, e opzionalmente crea un nuovo `CLIENT_SECRET`.

### Script disponibile

- `scripts/bootstrap-env.ps1`

### Requisiti script

- Azure CLI installato
- Login eseguito (`az login`)
- Permessi per leggere app registration e utente Entra
- Se usi `-RotateSecret`, permesso per creare credenziali applicative

### Esempio (senza ruotare il secret)

```powershell
pwsh ./scripts/bootstrap-env.ps1 `
  -AppObjectId "<app-object-id-o-appId>" `
  -GraphUserUpn "nome.cognome@tenant.com"
```

Questo genera `.env` con:
- `TENANT_ID`
- `CLIENT_ID`
- `GRAPH_USER_ID`
- `TOP`

### Esempio (genera anche nuovo secret)

```powershell
pwsh ./scripts/bootstrap-env.ps1 `
  -AppObjectId "<app-object-id-o-appId>" `
  -GraphUserUpn "nome.cognome@tenant.com" `
  -RotateSecret `
  -SecretDurationYears 1
```

In questo caso lo script crea un nuovo client secret (`az ad app credential reset --append`) e lo scrive in `.env`.

> Attenzione: il valore del secret è visibile solo in fase di creazione. Conservato in modo sicuro.

## Esecuzione

```bash
npm start
```

Output JSON generato in `data/`:
- `emails.json`
- `calendar-events.json`
- `teams-messages.json`

## Struttura

- `src/config.js`: validazione variabili ambiente
- `src/graphClient.js`: autenticazione MSAL + Graph client
- `src/collectors.js`: funzioni di raccolta per email/calendario/Teams
- `src/index.js`: entrypoint del processo
- `scripts/bootstrap-env.ps1`: helper PowerShell per generare `.env`

## Limiti e note

- Con `client credentials` leggi dati in base ai permessi applicativi e policy tenant.
- Endpoint Teams possono richiedere permessi/ruoli specifici e governance dedicata.
- Valuta salvataggio sicuro dei dati (cifratura, retention, controllo accessi).
