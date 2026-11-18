#!/usr/bin/env bash
set -euo pipefail

group=rg-sdd-3a-g5
prefix=sdd-3a-g5

for password in "${SQL_ADMIN_PASSWORD:-}" "${PLAYERS_DB_PASSWORD:-}" "${GAME_DB_PASSWORD:-}"; do
  if [[ ! "$password" =~ ^[A-Za-z0-9_!\-]{24,80}$ ||
        ! "$password" =~ [[:upper:]] || ! "$password" =~ [[:lower:]] ||
        ! "$password" =~ [[:digit:]] ]]; then
    echo 'SQL passwords must have 24–80 letters, digits, underscores, hyphens or exclamation marks, with upper and lowercase and a digit.' >&2
    exit 1
  fi
done
if [[ "$SQL_ADMIN_PASSWORD" == "$PLAYERS_DB_PASSWORD" ||
      "$SQL_ADMIN_PASSWORD" == "$GAME_DB_PASSWORD" ||
      "$PLAYERS_DB_PASSWORD" == "$GAME_DB_PASSWORD" ]]; then
  echo 'Use a separate password for each SQL account.' >&2
  exit 1
fi

foundation=$(az deployment group create --resource-group "$group" \
  --parameters infra/foundation.bicepparam --query properties.outputs -o json)
export SQL_HOST UI_URL
SQL_HOST=$(jq -er '.sqlHost.value' <<< "$foundation")
UI_URL=$(jq -er '.uiUrl.value' <<< "$foundation")

(
  ip=$(curl -4fsS --max-time 10 https://api.ipify.org)
  rule="github-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
  cleanup() {
    local status=$?
    az sql server firewall-rule delete --resource-group "$group" --server "$prefix-sql" \
      --name "$rule" --output none || status=1
    exit "$status"
  }
  trap cleanup EXIT
  az sql server firewall-rule create --resource-group "$group" --server "$prefix-sql" \
    --name "$rule" --start-ip-address "$ip" --end-ip-address "$ip" --output none
  node infra/init-sql.mjs
)

apps=$(az deployment group create --resource-group "$group" \
  --parameters infra/apps.bicepparam --query properties.outputs -o json)
{
  echo "PLAYERS_BASE_URL=$(jq -er '.playersUrl.value' <<< "$apps")"
  echo "GAME_BASE_URL=$(jq -er '.gameUrl.value' <<< "$apps")"
  echo "UI_BASE_URL=$UI_URL"
} >> "${GITHUB_ENV:?}"
