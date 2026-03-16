#!/bin/bash

# ==============================================================================
# SCRIPT PER LA RISCRITTURA DELLA CRONOLOGIA GIT
# ==============================================================================
# Questo script trasformerà tutti i messaggi dei commit nel formato richiesto,
# impostando contemporaneamente l'autore corretto e preservando le date originali.
#
# ATTENZIONE: Eseguire questo script all'interno di Git Bash.
# Si consiglia di creare un backup del ramo prima di procedere:
# git branch backup_pre_rewrite
# ==============================================================================

git filter-branch -f --msg-filter '
    # Definiamo il nuovo prefisso richiesto
    NEW_PREFIX="[my_ms_graph_api_collector][#324913] PC emails network TP #2026 - "
    
    # Pulizia del messaggio originale:
    # Rimuoviamo i vecchi tag [shinjigi], i prefissi "feat:", "Docs -", ecc.
    # Usiamo sed con espressioni regolari estese per isolare il contenuto reale.
    CLEAN_MSG=$(cat | sed -E "s/^(\[shinjigi\]\[#[0-9]+\] (PC emails network TP #[0-9]+ - )?|feat: |Docs — |Docs - )//")
    
    # Restituiamo il messaggio finale standardizzato
    echo "${NEW_PREFIX}${CLEAN_MSG}"
' --env-filter '
    # Impostazione dell'identità dell'autore e del committer richiesta
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

# ==============================================================================
# NOTE POST-ESECUZIONE:
# 1. Se hai già pushato i commit sul server, dovrai fare: git push --force
# 2. Per pulire i backup temporanei creati da Git: 
#    git update-ref -d refs/original/refs/heads/main
# ==============================================================================