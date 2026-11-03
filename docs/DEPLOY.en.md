# Deployment and maintenance

[Back to project](../README.en.md) · [简体中文](DEPLOY.zh-CN.md)

For guided first-time setup, run `bash deploy.sh` in the project folder. The sections below cover manual setup, HTTPS, configuration, backups, and maintenance.

## 1. Prerequisites

- Docker Engine with Compose v2, or Docker Desktop. `docker compose version` and `docker info` must succeed.
- Bash and OpenSSL to generate local internal keys. Use a terminal on macOS/Linux/NAS; on Windows use WSL2.
- Recommended: at least 2 GB available RAM and 4 GB free disk, plus backup space. Image platform support depends on the upstream images; see the delivery verification record for platforms actually tested.
- Access to Docker Hub and `registry.npmjs.org`. Do not disable TLS verification to bypass network problems.
- No domain needed for local testing. Prepare your own domain, HTTPS, and firewall for remote use.

Extract the source archive and enter the `habit-hero` directory containing `compose.yml`. Run all commands there unless stated otherwise. Do not copy an old project's database, `.env`, or private deployment scripts into it.

## 2. First local deployment

```sh
bash scripts/setup.sh
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:4319/healthz
```

`setup.sh` checks Docker/Compose and creates a mode-600 `.env` with two independent random internal keys. An existing `.env` is preserved. Missing configuration fails without printing secrets. If you already copied `.env.example`, generate two different values with `openssl rand -hex 32` and fill in `HH_GATEWAY_KEY` and `HH_EDGE_KEY`, then rerun setup. Never commit `.env` or enter these keys into the browser.

When `sync` and `web` are healthy, create the first parent account:

```sh
bash scripts/account.sh create-user my-parent
```

The script hides password input, asks for confirmation, and passes it through stdin rather than command-line arguments. Usernames: 3–80 characters, case-insensitive. Passwords: 10–256 characters. There is no default password. Open **http://127.0.0.1:4319**, log in, create a family, and add a child.

Only localhost is exposed initially; **public registration is disabled by default**. A website visitor cannot claim the first administrator account. A server operator creates the first account; parents can then generate single-use family invitations for others to register and join.

## 3. LAN, NAS, and HTTPS

### Trusted LAN trial

Set `HH_WEB_BIND=0.0.0.0` in `.env`, change `HH_WEB_PORT` if needed, and run `docker compose up -d --wait`. On a phone, open `http://YOUR_NAS_LAN_IP:4319`, not the phone's own `127.0.0.1`. Restrict the firewall to a trusted LAN. HTTP is unencrypted and is only suitable for controlled testing.

On a NAS, place the complete source in your own application directory, SSH into that directory, and run the same commands. The database lives in a Docker named volume, **not the source directory**. Keep the Compose project name stable; changing it selects a different, empty volume. Check logs and volume ownership rather than granting directories mode 777.

### Public HTTPS with the included Caddy configuration

1. Point your domain's A/AAAA records to the server. Only publish working IPv6 records.
2. Replace `HH_DOMAIN` in `.env` with your own domain, such as `habits.example.com`. Do not leave `habit.example.com`.
3. Allow/forward TCP ports 80 and 443. If a NAS proxy already uses them, use the existing-proxy option below.
4. Keep `HH_WEB_BIND=127.0.0.1` and expose the service through Caddy:

```sh
bash scripts/setup.sh --https
docker compose --profile https up -d --build --wait
docker compose logs --tail=80 caddy
```

Open `https://YOUR_DOMAIN`; verify a trusted certificate and working login. Caddy state and certificates persist in named volumes. Local tests cannot validate your DNS, public certificate, router, or physical phone.

### Existing Nginx, NAS reverse proxy, or CDN

Proxy HTTPS to the web port. **Do not publish the sync API port 4318.** The trusted proxy must overwrite `X-HH-Edge-IP` with the client address it actually observes and `X-HH-Edge-Key` with the private value from `.env`. Never pass through client-supplied values. Nginx example:

```nginx
location / {
    proxy_pass http://127.0.0.1:4319;
    proxy_set_header X-HH-Edge-IP $remote_addr;
    proxy_set_header X-HH-Edge-Key "YOUR_PRIVATE_HH_EDGE_KEY";
}
```

This only shows the proxy location; your existing configuration must provide TLS. Restrict access to the config file. With a CDN or multiple proxies, first configure the provider's trusted address ranges and use the verified client address, not an arbitrary `X-Forwarded-For`. Without trusted headers, rate limiting falls back to the proxy's address and its users may share a budget. The included Caddy configuration already overwrites the headers.

## 4. Configuration

After editing `.env`, run `docker compose up -d --wait`; add `--profile https` for HTTPS deployments.

| Setting | Default / purpose |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | `habit-hero`; controls volume names, keep stable |
| `HH_WEB_BIND` / `HH_WEB_PORT` | `127.0.0.1` / `4319`; web bind address and port |
| `HH_DOMAIN` | Placeholder; replace before enabling HTTPS |
| `HH_DB_PATH` | `/data/habit-hero.sqlite` inside the container; change to a new `/data/...` path for restore |
| `HH_GATEWAY_KEY` / `HH_EDGE_KEY` | Two independent random internal keys from setup, at least 32 characters; keep private |
| `HH_REGISTRATION` | `invite`: operator-created or valid family-invited accounts; `open`: deliberately allow anyone to register |
| `HH_MAX_USERS` / `HH_MAX_FAMILIES` | 100 accounts / 100 families service-wide; at most 5 families per account |
| `HH_ASSET_BYTES` | 268435456 (256 MiB) attachments per family; 8 MiB per image |
| `HH_FAMILY_BYTES` | 335544320 (320 MiB) logical quota for records, attachments, sync history, receipts, and import plans per family |
| `HH_DB_MAX_BYTES` | SQLite page limit approximately 2 GiB; excludes WAL, backups, and container images |
| `HH_MIN_FREE_BYTES` | Pause new business writes below 256 MiB free disk; monitor capacity proactively |

Additional bounds: 1000 attachments and 20 active invitations and child devices per family, 5 pending import previews, and 20 parent sessions per account. Per-minute limits: 60 authentication requests per trusted source, 10 per source/username pair, 120 ordinary writes per account, 20 uploads/previews, 30 child writes, and 5 password/revocation checks. Compose also limits memory, CPU, and process count. Network attack protection, host disk alerts, and backup retention remain the operator's responsibility.

## 5. Start using the app

1. **Log in and create a family:** enter a family name, then add a child. The family timezone comes from the creating browser.
2. **Parent area:** select a child, then 「家长入口」. Parent accounts have management permission; a default four-digit PIN is no longer presented as an authorization boundary.
3. **Habits and rewards:** create items in their tabs, or use 「添加示例任务与奖励」 in settings. Optional templates are editable and do not duplicate on repeated clicks; they contain no author's family data.
4. **Independent child device:** settings → 「启用儿童设备」 → generate a code for the current child. In another browser, expand 「儿童设备登录」 on the login page and enter it. A code works once within 10 minutes; the child session lasts 30 days.
5. **Shared device:** 「将本浏览器切换为儿童设备」 revokes this browser's parent session and removes its parent credential. Returning to management requires logging out and signing in with the parent account password. Do not save the parent password in a child's browser password manager. Viewing the child page while signed in as a parent is only a preview and does not reduce permissions.
6. **Submit and approve:** a child completion creates a pending task. Parent approval grants points; the same pending task cannot be awarded twice. The child API derives the task name and points from the server definition.
7. **Redeem:** the server uses the configured reward price and prevents overspending. Retries after a lost response affect the balance once. New redemption confirmation expires after about two minutes; old spending is not automatically replayed after restore.
8. **Invite parents:** settings → 「邀请家人」. Privately share the code; a new user registers with it, or an existing account logs in and joins. Codes last 24 hours and work once. Invited users become family administrators.
9. **Account maintenance:** settings supports changing passwords, revoking all of this account's sessions, revoking child devices, and removing other family members. Password changes revoke all devices. Removal immediately blocks family access and preserves history. The last administrator cannot be removed.

Child sessions can only read their own data, submit habits, and redeem rewards. They cannot edit configuration, grant arbitrary points, read other children, invite users, import/export the entire family, or create families. These are device sessions, not independently password-managed child accounts. Keep parent devices private.

For pending operations, reconnect and select 「核对并刷新」. Do not clear browser storage before reconciliation; balances remain server-confirmed. Revoking access cannot remotely erase family data already downloaded into a browser.

## 6. Lost accounts, storage, and maintenance

Server operators can run:

```sh
bash scripts/account.sh reset-password my-parent
bash scripts/account.sh revoke-sessions my-parent
docker compose exec -T sync node server/src/admin.mjs storage
```

Password reset revokes that account's parent and child sessions. There is no email recovery. Server access grants recovery authority and must be restricted to trusted operators.

Inspect unused attachments before explicitly pruning them; back up first:

```sh
docker compose exec -T sync node server/src/admin.mjs prune-assets FAMILY_ID
# Review candidate hashes and sizes before applying:
docker compose exec -T sync node server/src/admin.mjs prune-assets FAMILY_ID --apply
```

The tool preserves attachments referenced by current records, sync history, and active/committed import plans. It does not remove ledgers, family records, or receipts. The database file may not shrink immediately; SQLite can reuse free pages. If historical data reaches the family quota, assess expanding it rather than deleting receipts and breaking idempotency. Backups are not automatically rotated; establish an off-host retention policy.

## 7. Import, backup, and restore

Parent settings exports the whole family as JSON, including attachments but excluding login tokens. Import accepts family exports and compatible legacy H5/iOS JSON: select file → map children → resolve balances and duplicates → preview → confirm. Do not replace this database with an old application's database. Backups contain private family data.

Consistent online backup:

```sh
sh scripts/backup.sh
```

The script uses SQLite `VACUUM INTO` and integrity checks, then saves `backups/habit-hero-TIMESTAMP.sqlite` on the host with mode 600. Another copy remains in the data volume. Attachments are included. Do not copy only a live main database while omitting its WAL. Keep secure off-host copies and rehearse restoration.

### Restore into a new database, retaining the original

Pause family writes and back up the current database first. Replace the backup path below:

```sh
BACKUP_FILE=backups/habit-hero-YYYYMMDDTHHMMSSZ.sqlite
RESTORE_ID=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T sync sh -c 'umask 077; set -C; cat > "$1"' sh "/data/restore-input-${RESTORE_ID}.sqlite" < "$BACKUP_FILE"
docker compose stop web sync
docker compose run --rm --no-deps sync node server/src/admin.mjs restore \
  "/data/restore-input-${RESTORE_ID}.sqlite" "/data/restored-${RESTORE_ID}.sqlite"
printf 'HH_DB_PATH=/data/restored-%s.sqlite\n' "$RESTORE_ID"
```

**Replace** the `HH_DB_PATH` line in `.env` with the printed value, then run `docker compose up -d --wait` (add `--profile https` for HTTPS). Restore refuses an existing target, checks integrity, rotates the dataset epoch, and revokes all saved sessions, child codes, and family invitations so previously revoked credentials are not resurrected. Accounts whose passwords changed after the backup need the backup-time password or an operator reset.

In a fresh browser, log in and check the restore point, children, balances, and attachments. In an old browser with pending operations or a changed-server warning, use 「恢复旧浏览器」:

1. Download the recovery record with the old queue, cached records, and any obtainable receipts. Unknown/missing receipts do not prove an operation never executed.
2. Confirm the download is saved, then select 「归档并断开旧连接」. A local archive write failure stops the process and preserves pending operations.
3. Log in and select the family again. Compare the downloaded record with restored history and make explicit parent corrections if needed. **Old spending is never automatically replayed; recovery records are not automatically importable ledgers.**

If restoration fails, retain or restore the original `HH_DB_PATH` and restart the original database. Do not alternate between two databases that have both received new writes. Issue new codes for child devices.

## 8. Updates and troubleshooting

Before updating, back up and retain source, `.env`, the project name, and volumes. Check release notes and new `.env.example` settings. Then:

```sh
docker compose up -d --build --wait
docker compose logs --tail=100 sync web
```

Stop with `docker compose stop`, resume with `docker compose up -d --wait`. **Do not update with `down -v`, and do not run multiple sync writers against one SQLite volume.** The Node baseline is 24.22.1; monitor security releases, update images/lockfiles, and retest. Pinning a version is not a permanent security guarantee.

| Symptom | Action |
| --- | --- |
| Missing internal keys | Run setup; an existing blank `.env` needs two independent generated keys |
| Port occupied | Change `HH_WEB_PORT`; check 80/443 and existing NAS proxies |
| unhealthy / 502 | Inspect logs, volume permissions, and free disk; default upstream is `http://sync:4318` |
| Registration restricted | Ask the operator to create an account, or use a one-time family invitation |
| Login 429 | Wait a minute; ensure trusted proxies overwrite client headers instead of grouping everyone behind one address |
| Forgotten password | Operator runs reset-password; no email recovery |
| Quota / low disk | Check storage and host capacity, inventory unused assets, then back up and prune or expand |
| Restored service / stuck old queue | Download recovery record, archive/disconnect, log in and reconcile manually |
| Phone cannot connect | Check bind address, firewall, DNS, and certificate; validate on a real phone separately |

## 9. Development and verification

Use Node.js **24.22.1 or newer 24.x** with built-in SQLite; no additional database needed. Development instances also default to controlled registration.

```sh
npm ci --prefix Habit_Hero_h5
npm run build --prefix Habit_Hero_h5
node --test server/test/*.test.mjs Habit_Hero_h5/tests/*.test.mjs
npm audit --prefix Habit_Hero_h5
```

Start the service and UI in separate terminals:

```sh
HH_DB_PATH=./data/dev.sqlite HOST=127.0.0.1 PORT=4318 node server/src/index.mjs
# First create a development account in another terminal, supplying its password on stdin:
# HH_DB_PATH=./data/dev.sqlite node server/src/admin.mjs create-user my-parent
```

```sh
cd Habit_Hero_h5
SYNC_SERVER_URL=http://127.0.0.1:4318 npm run dev
```

The development account tool reads stdin; use the hidden-input helper above for production. Vite is for local development; the production same-origin gateway serves both static files and API. After building, run it with `SYNC_SERVER_URL=http://127.0.0.1:4318 HOST=127.0.0.1 PORT=4319 npm start`.

CI runs functional, security, and recovery tests, type checking, and builds. Dependabot proposes weekly dependency updates. Tests use temporary databases and synthetic data; they do not replace penetration tests, physical-phone acceptance, or long-term operation evidence. License texts ship with production static assets; third-party notices are generated at build time.
