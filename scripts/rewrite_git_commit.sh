#!/bin/bash

# ==============================================================================
# SCRIPT PER LA RISCRITTURA DELLA CRONOLOGIA GIT (WSL Optimized - V3)
# ==============================================================================
# Corretta la gestione dei messaggi per evitare la perdita dei commenti originali.
#
# NOTA PER WSL: Se ricevi l'errore "bad interpreter: /bin/bash^M", esegui:
# sed -i 's/\r$//' rewrite_history.sh
# ==============================================================================

export FILTER_BRANCH_SQUELCH_WARNING=1

# Verifica se il repository è pulito
if [ -n "$(git status --porcelain)" ]; then
  echo "ERRORE: Hai modifiche non salvate. Esegui 'git stash' prima."
  exit 1
fi

# Rimuove backup precedenti se esistenti (necessario per rieseguire)
rm -rf .git/refs/original/

echo "Avvio riscrittura della cronologia..."

git filter-branch -f --msg-filter '
    # Leggiamo il messaggio originale in una variabile
    MSG=$(cat)
    
    # Prefisso desiderato
    PREFIX="[my_ms_graph_api_collector][#324913] PC emails network TP #2026 - "
    
    # Pulizia: rimuoviamo i vari prefissi noti (inclusi quelli raddoppiati)
    # Usiamo sed con regex senza virgolette annidate problematiche
    CLEAN=$(echo "$MSG" | sed -E "s/^(\[my_ms_graph_api_collector\]\[#[0-9]+\] PC emails network TP #[0-9]+ - |\[shinjigi\]\[#[0-9]+\] (PC emails network TP #[0-9]+ - )?|feat: |Docs — |Docs - )+//g")
    
    # Rimuoviamo spazi bianchi iniziali
    FINAL_BODY=$(echo "$CLEAN" | sed "s/^[[:space:]]*//")
    
    # Se dopo la pulizia il corpo è vuoto, usa il messaggio originale (sicurezza)
    if [ -z "$FINAL_BODY" ]; then
        echo "$PREFIX$MSG"
    else
        echo "$PREFIX$FINAL_BODY"
    fi
' --env-filter '
    CORRECT_NAME="Luigi De Pinto"
    CORRECT_EMAIL="your-username@italy.conseur.org"
    
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
    export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
' --tag-name-filter cat -- --all

echo "Operazione completata."
