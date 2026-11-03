#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
case "${1:-}" in create-user|reset-password|revoke-sessions) action=$1;; *) echo 'Usage: bash scripts/account.sh create-user|reset-password|revoke-sessions USERNAME' >&2; exit 2;; esac
[[ -n "${2:-}" ]] || { echo 'Username required' >&2; exit 2; }
if [[ "$action" == revoke-sessions ]]; then
 docker compose exec -T sync node server/src/admin.mjs "$action" "$2"
else
 IFS= read -r -s -p 'Password (10–256 characters): ' password </dev/tty
 printf '\n' >/dev/tty
 IFS= read -r -s -p 'Repeat password: ' repeat </dev/tty
 printf '\n' >/dev/tty
 [[ "$password" == "$repeat" ]] || { echo 'Passwords differ' >&2; exit 2; }
 printf '%s\n' "$password" | docker compose exec -T sync node server/src/admin.mjs "$action" "$2"
 unset password repeat
fi
