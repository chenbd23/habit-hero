#!/usr/bin/env bash
# First-run setup and startup; never deletes or resets existing data.
set -euo pipefail
cd "$(dirname "$0")"
if [[ "${1:-}" == --help ]]; then
 printf '%s\n' 'Usage: bash deploy.sh' 'Checks Docker, generates private configuration, starts services, and creates the first parent account.' '需要 Docker、Compose v2、Bash、OpenSSL；已有配置、账户和数据会保留。'
 exit 0
fi
[[ $# -eq 0 ]] || { echo 'Usage: bash deploy.sh' >&2; exit 2; }
trap 'echo "部署未完成，已有数据已保留。修正提示的问题后可再次运行。 / Setup incomplete; existing data is preserved. Rerun after resolving the error." >&2' ERR
fresh=false
[[ -e .env ]] || fresh=true
bash scripts/setup.sh
if [[ "$fresh" == true ]]; then
 printf '\n是否允许同一局域网的手机访问？ / Allow phones on your trusted LAN? [y/N] '
 IFS= read -r lan </dev/tty
 if [[ "$lan" == y || "$lan" == Y ]]; then
  umask 077
  staged=$(mktemp .env.deploy.XXXXXX)
  awk '/^HH_WEB_BIND=/{print "HH_WEB_BIND=0.0.0.0";next}{print}' .env > "$staged"
  mv "$staged" .env
 fi
fi
printf '\n正在启动，首次需要下载并构建镜像… / Starting services; first run downloads and builds images…\n'
docker compose up -d --build --wait
bootstrap=$(docker compose exec -T sync node --input-type=module -e "const r=await fetch('http://127.0.0.1:4318/api/v1/info');if(!r.ok)process.exit(1);console.log((await r.json()).needsBootstrap?'yes':'no');")
if [[ "$bootstrap" == yes ]]; then
 printf '\n创建第一个家长账户 / Create the first parent account\n用户名 / Username: '
 IFS= read -r username </dev/tty
 bash scripts/account.sh create-user "$username"
elif [[ "$bootstrap" != no ]]; then
 echo 'Cannot confirm account setup state; no account changes made.' >&2
 exit 1
fi
port=$(awk -F= '$1=="HH_WEB_PORT"{print $2;exit}' .env)
bind=$(awk -F= '$1=="HH_WEB_BIND"{print $2;exit}' .env)
printf '\n部署完成 / Ready!\n电脑打开 / Open on this computer: http://127.0.0.1:%s\n' "$port"
if [[ "$bind" == 0.0.0.0 ]]; then
 lan_ip=''
 if command -v ipconfig >/dev/null 2>&1; then lan_ip=$(ipconfig getifaddr en0 2>/dev/null || true); fi
 if [[ -z "$lan_ip" ]] && command -v hostname >/dev/null 2>&1; then lan_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || true); fi
 if [[ -n "$lan_ip" ]]; then printf '同一局域网手机 / Phone on the same LAN: http://%s:%s\n' "$lan_ip" "$port"; fi
 printf '若上述地址不通，使用运行 Docker 的电脑/NAS 的局域网 IP 和端口 %s。\nIf needed, use your Docker host/NAS LAN IP and port %s.\n' "$port" "$port"
fi
printf '用家长账户登录 → 创建家庭和孩子 → 设置任务与奖励。\nLog in → create your family and child → add habits and rewards.\n'
printf '远程访问请配置 HTTPS，见 docs/DEPLOY.zh-CN.md / For remote access, configure HTTPS: docs/DEPLOY.en.md\n'
