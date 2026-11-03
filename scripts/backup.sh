#!/bin/sh
# Run from the repository root with POSIX sh; no host Node.js is needed.
set -eu
umask 077
stamp=$(date -u +%Y%m%dT%H%M%SZ)
name="habit-hero-${stamp}.sqlite"
mkdir -p backups
if [ -e "backups/$name" ]; then
  echo "Backup already exists; wait a second and retry." >&2
  exit 1
fi
docker compose exec -T sync sh -c 'node server/src/admin.mjs backup "$HH_DB_PATH" "$1"' sh "/data/backups/$name"
docker compose cp "sync:/data/backups/$name" "backups/$name"
chmod 600 "backups/$name"
printf 'Backup saved: backups/%s\n' "$name"
