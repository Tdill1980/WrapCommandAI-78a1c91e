#!/usr/bin/env bash
# restart-edge-function.sh
# Force a cold restart of a Supabase edge function by re-saving a secret.
#
# Supabase edge functions cache secrets at isolate boot time.  Re-POSTing a
# secret via the Management API forces every function isolate to restart and
# pick up the latest values — no CLI, no repo clone, no deploy needed.
#
# Usage:
#   SUPABASE_ACCESS_TOKEN=sbp_... ./scripts/restart-edge-function.sh
#
# Or pass the token inline:
#   SUPABASE_ACCESS_TOKEN=sbp_... ANTHROPIC_API_KEY=sk-ant-... ./scripts/restart-edge-function.sh

set -euo pipefail

PROJECT_REF="${SUPABASE_PROJECT_REF:-qxllysilzonrlyoaomce}"

if [ -z "${SUPABASE_ACCESS_TOKEN:-}" ]; then
  echo "Error: SUPABASE_ACCESS_TOKEN is required."
  echo "Generate one at https://supabase.com/dashboard/account/tokens"
  exit 1
fi

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  read -rsp "Enter ANTHROPIC_API_KEY value: " ANTHROPIC_API_KEY
  echo
fi

echo "Re-saving ANTHROPIC_API_KEY for project ${PROJECT_REF} ..."

HTTP_STATUS=$(curl -s -o /dev/stderr -w "%{http_code}" \
  -X POST "https://api.supabase.com/v1/projects/${PROJECT_REF}/secrets" \
  -H "Authorization: Bearer ${SUPABASE_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "[{\"name\":\"ANTHROPIC_API_KEY\",\"value\":\"${ANTHROPIC_API_KEY}\"}]" 2>&1)

if [ "$HTTP_STATUS" -ge 200 ] && [ "$HTTP_STATUS" -lt 300 ]; then
  echo "Done (HTTP ${HTTP_STATUS}). All edge functions will cold-restart on next invocation."
else
  echo "Failed (HTTP ${HTTP_STATUS}). Check your access token and project ref."
  exit 1
fi
