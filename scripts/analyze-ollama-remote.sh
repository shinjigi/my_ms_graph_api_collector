#!/usr/bin/env bash
# Test analyzer against the remote qwen2.5-coder:3b Docker instance on 192.168.1.19.
#
# Target week: 2026-W12 (March 16-22, 2026 — last week)
#
# Endpoint options (uncomment the one that works):
#   Direct Ollama API (port 11434 must be exposed):
#     OPENAI_BASE_URL=http://192.168.1.19:11434/v1
#   Open WebUI OpenAI-compatible API (no external API key needed for local access):
#     OPENAI_BASE_URL=http://192.168.1.19:3000/openai
#     OPENAI_API_KEY=<your-open-webui-api-key-from-settings>

set -euo pipefail

OPENAI_BASE_URL="${OPENAI_BASE_URL:-http://192.168.1.19:11434/v1}" \
OPENAI_MODEL="${OPENAI_MODEL:-qwen2.5-coder:3b}" \
OPENAI_API_KEY="${OPENAI_API_KEY:-ollama}" \
OPENAI_MODEL_MAX_TPM="${OPENAI_MODEL_MAX_TPM:-5000}" \
    node_modules/.bin/tsx src/analysis/analyzer.ts \
        --provider=ollama \
        --week=2026-W12 \
        --force
