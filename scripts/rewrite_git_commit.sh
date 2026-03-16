#!/bin/bash

# ==============================================================================
# SCRIPT PER LA RISCRITTURA DELLA CRONOLOGIA GIT (V2 - Robust Version)
# ==============================================================================
# Trasforma i messaggi dei commit, imposta l'autore e preserva le date originali.
#
# REQUISITO: La cartella di lavoro deve essere PULITA (niente modifiche pendenti).
# Se hai modifiche pendenti, esegui: git stash
# ==============================================================================

# 1. Squelch del warning di filter-branch
export FILTER_BRANCH_SQUELCH_WARNING=1

# 2. Verifica se il repository è pulito
if [ -n "$(git status --porcelain)" ]; then
  echo "ERRORE: Hai modifiche non salvate (unstaged/staged changes)."
  echo "Esegui 'git stash' o 'git commit' prima di lanciare questo script."
  exit 1
fi

echo "Avvio riscrittura della cronologia..."

git filter-branch -f --msg-filter '
    # Definiamo il nuovo prefisso richiesto
    NEW_PREFIX="[my_ms_graph_api_collector][#324913] PC emails network TP #2026 - "
    
    # Pulizia del messaggio originale:
    # Rimuoviamo i vecchi tag [shinjigi], i prefissi "feat:", "Docs -", ecc.
    CLEAN_MSG=$(cat | sed -E "s/^(\[shinjigi\]\[#[0-9]+\] (PC emails network TP #[0-9]+ - )?|feat: |Docs — |Docs - )//")
    
    # Restituiamo il messaggio finale standardizzato
    echo "${NEW_PREFIX}${CLEAN_MSG}"
' --env-filter '
    # Impostazione dell identità dell autore e del committer richiesta
    CORRECT_NAME="Luigi de Pinto"
    CORRECT_EMAIL="your-username@italy.conseur.org"
    
    export GIT_AUTHOR_NAME="$CORRECT_NAME"
    export GIT_AUTHOR_EMAIL="$CORRECT_EMAIL"
    export GIT_COMMITTER_NAME="$CORRECT_NAME"
    export GIT_COMMITTER_EMAIL="$CORRECT_EMAIL"
    
    # PRESERVAZIONE DATA:
    # Forziamo la data del commit (Committer Date) affinché sia identica
    # alla data di creazione originale (Author Date).
    export GIT_COMMITTER_DATE="$GIT_AUTHOR_DATE"
' --tag-name-filter cat -- --all

echo "Operazione completata con successo."

# ==============================================================================
# NOTE POST-ESECUZIONE:
# 1. Per applicare le modifiche al server: git push --force
# 2. Se hai usato stash prima: git stash pop
# 3. Per pulire i riferimenti temporanei: git update-ref -d refs/original/refs/heads/main
# ==============================================================================