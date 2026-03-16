#!/bin/bash

# ==============================================================================
# SCRIPT PER LA RISCRITTURA DELLA CRONOLOGIA GIT (WSL Optimized)
# ==============================================================================
# Trasforma i messaggi dei commit, imposta l'autore e preserva le date originali.
#
# NOTA PER WSL: Se ricevi l'errore "bad interpreter: /bin/bash^M", esegui:
# sed -i 's/\r$//' rewrite_history.sh
# ==============================================================================

# 1. Squelch del warning di filter-branch
export FILTER_BRANCH_SQUELCH_WARNING=1

# 2. Verifica se ci si trova su un file system montato (/mnt/c/...)
if pwd | grep -q "^/mnt/"; then
  echo "AVVISO: Stai eseguendo lo script su un disco Windows montato (/mnt/)."
  echo "Le prestazioni di Git potrebbero essere ridotte."
fi

# 3. Verifica se il repository è pulito
if [ -n "$(git status --porcelain)" ]; then
  echo "ERRORE: Hai modifiche non salvate (unstaged/staged changes)."
  echo "Esegui 'git stash' o 'git commit' prima di lanciare questo script."
  exit 1
fi

echo "Avvio riscrittura della cronologia in ambiente WSL..."

git filter-branch -f --msg-filter '
    # Definiamo il nuovo prefisso richiesto
    NEW_PREFIX="[my_ms_graph_api_collector][#324913] PC emails network TP #2026 - "
    
    # Pulizia del messaggio originale (compatibile con GNU sed di Linux)
    CLEAN_MSG=$(cat | sed -E "s/^(\[shinjigi\]\[#[0-9]+\] (PC emails network TP #[0-9]+ - )?|feat: |Docs — |Docs - )//")
    
    # Restituiamo il messaggio finale standardizzato
    echo "${NEW_PREFIX}${CLEAN_MSG}"
' --env-filter '
    # Impostazione dellidentità dellautore e del committer richiesta
    CORRECT_NAME="Luigi De Pinto"
    CORRECT_EMAIL="ldepinto@italy.conseur.org"
    
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
    
    # PRESERVAZIONE DATA ORIGINALE
    export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
' --tag-name-filter cat -- --all

echo "Operazione completata con successo."
