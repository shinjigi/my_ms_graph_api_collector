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
CLIENT_SECRET=...
GRAPH_USER_ID=utente@tenant.com
TOP=25
```

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

## Limiti e note

- Con `client credentials` leggi dati in base ai permessi applicativi e policy tenant.
- Endpoint Teams possono richiedere permessi/ruoli specifici e governance dedicata.
- Valuta salvataggio sicuro dei dati (cifratura, retention, controllo accessi).
