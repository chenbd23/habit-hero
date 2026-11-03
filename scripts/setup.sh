#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo 'Install Docker Engine/Desktop and Compose v2 first.' >&2; exit 1; }
command -v openssl >/dev/null || { echo 'Install openssl first.' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null
if [[ ! -e .env ]]; then
 umask 077
 gateway=$(openssl rand -hex 32)
 edge=$(openssl rand -hex 32)
 while IFS= read -r line || [[ -n "$line" ]]; do
  case "$line" in HH_GATEWAY_KEY=*) printf 'HH_GATEWAY_KEY=%s\n' "$gateway";; HH_EDGE_KEY=*) printf 'HH_EDGE_KEY=%s\n' "$edge";; *) printf '%s\n' "$line";; esac
 done < .env.example > .env
fi
read_setting() { awk -F= -v key="$1" '$1==key {sub(/^[^=]*=/, ""); print; exit}' .env; }
port=$(read_setting HH_WEB_PORT)
[[ "$port" =~ ^[0-9]+$ ]] && ((port>=1 && port<=65535)) || { echo 'HH_WEB_PORT must be 1–65535.' >&2; exit 1; }
gateway=$(read_setting HH_GATEWAY_KEY)
edge=$(read_setting HH_EDGE_KEY)
[[ ${#gateway} -ge 32 && ${#edge} -ge 32 && "$gateway" != "$edge" ]] || { echo 'Set two different internal keys, each at least 32 characters.' >&2; exit 1; }
db_path=$(read_setting HH_DB_PATH)
[[ "$db_path" == /data/* && "$db_path" != *..* ]] || { echo 'HH_DB_PATH must be a path inside /data.' >&2; exit 1; }
if [[ "${1:-}" == --https ]]; then
 domain=$(read_setting HH_DOMAIN)
 [[ "$domain" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ && "$domain" != habit.example.com ]] || { echo 'Set HH_DOMAIN to your own real DNS domain.' >&2; exit 1; }
 docker compose --profile https config --quiet
else
 docker compose config --quiet
fi
if command -v lsof >/dev/null && lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
 echo 'Web port is already listening. This is expected for an existing deployment; otherwise change HH_WEB_PORT.'
fi
unset gateway edge
echo 'Configuration ready. Existing .env was preserved. Next: docker compose up -d --build'
