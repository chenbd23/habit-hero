# 详细部署与维护

[返回项目介绍](../README.md) · [English](DEPLOY.en.md)

日常首次部署只需在项目目录运行 `bash deploy.sh`。下面保留手动部署、HTTPS、配置、备份与维护的详细说明。

## 1. 准备环境

- Docker Engine + Compose v2，或 Docker Desktop；运行 `docker compose version`、`docker info` 应成功。
- Bash、OpenSSL（生成本机内部密钥）；Mac、常见 Linux/NAS 可使用。Windows 请在 WSL2 终端执行这些脚本。
- 建议至少 2 GB 可用内存、4 GB 可用磁盘，并另外留出备份空间。镜像支持情况以 Docker 拉取结果为准；本次验证平台见交付验收记录。
- 能访问 Docker Hub 和 `registry.npmjs.org`；不要关闭 TLS 校验绕过网络问题。
- 本机试用无需域名；远程使用应准备自己的域名、HTTPS 和防火墙。

解压源码包后进入包含 `compose.yml` 的 `habit-hero` 目录。下列命令都在该目录执行。不要把旧项目的数据库、`.env` 或个人部署脚本复制进来。

## 2. 本机首次部署

```sh
bash scripts/setup.sh
docker compose up -d --build --wait
docker compose ps
curl --fail http://127.0.0.1:4319/healthz
```

`setup.sh` 检查 Docker/Compose，首次生成权限为 600 的 `.env` 和两个随机内部密钥，已有 `.env` 原样保留。缺少配置会报错，不会打印密钥。若你先手动复制了 `.env.example`，请用 `openssl rand -hex 32` 分别生成两个不同值填入 `HH_GATEWAY_KEY`、`HH_EDGE_KEY`，再运行脚本。不要提交 `.env`，不要将内部密钥填写到浏览器。

看到 `sync`、`web` healthy 后，创建首个家长账户：

```sh
bash scripts/account.sh create-user my-parent
```

脚本隐藏输入并要求重复确认密码，密码不出现在命令行参数中。用户名 3–80 字符，忽略大小写；密码 10–256 字符，没有默认密码。浏览器打开 **http://127.0.0.1:4319**，用刚创建的账户登录，创建家庭和孩子。

默认仅本机可访问，**公开注册默认关闭**。即使网站已有访问者，也不能通过网页抢先注册管理员。首个账户由有服务器操作权限的部署者创建；之后可由家长生成一次性邀请码注册并加入家庭。

## 3. 局域网、NAS 与 HTTPS

### 可信局域网试用

在 `.env` 设置 `HH_WEB_BIND=0.0.0.0`，必要时修改 `HH_WEB_PORT`，再运行 `docker compose up -d --wait`。手机访问 `http://你的NAS局域网IP:4319`，不是手机自身的 `127.0.0.1`。防火墙只允许可信局域网；HTTP 不加密，仅用于受控试用。

NAS 用户可把完整源码放入自己创建的应用目录，通过 SSH 进入该目录执行上述命令。数据库使用 Docker 命名卷，**不会写入源码目录**。保持 Compose 项目名不变，否则会看到新的空数据卷。不要授予目录 777 权限来排错；查看容器日志及卷权限。

### 使用附带 Caddy 配置公网 HTTPS

1. 将自己的域名 A/AAAA 记录指向部署服务器；只保留实际可用的 IPv6 记录。
2. 在 `.env` 将 `HH_DOMAIN` 改为自己的域名，例如 `habits.example.com`；不能保留 `habit.example.com`。
3. 允许并转发 TCP 80/443。若已有 NAS 反向代理占用端口，选择下面的自有代理方案。
4. 保持 `HH_WEB_BIND=127.0.0.1`，只通过 Caddy 暴露服务：

```sh
bash scripts/setup.sh --https
docker compose --profile https up -d --build --wait
docker compose logs --tail=80 caddy
```

浏览器打开自己的 `https://域名`，确认受信任的证书和登录正常。证书与 Caddy 状态保存在命名卷中。本机测试不能替代你的 DNS、证书、路由器和真实手机验收。

### 自有 Nginx、NAS 反向代理或 CDN

将 HTTPS 代理到 web 端口，**不要发布 sync 的 4318 端口**。可信代理必须覆盖 `X-HH-Edge-IP` 为它实际看见的客户端地址，并覆盖 `X-HH-Edge-Key` 为 `.env` 中的内部值；不得转发用户自带的同名值。Nginx 示例：

```nginx
location / {
    proxy_pass http://127.0.0.1:4319;
    proxy_set_header X-HH-Edge-IP $remote_addr;
    proxy_set_header X-HH-Edge-Key "YOUR_PRIVATE_HH_EDGE_KEY";
}
```

这里只展示反向代理段，TLS 证书由你的现有配置提供。配置文件须限制读取权限。CDN、多级代理下需先按供应商配置可信地址范围，再使用已核验的真实 IP，不能直接信任任意 `X-Forwarded-For`。未配置可信标头时会按代理地址限流，处于该代理后的用户可能共享额度。附带 Caddy 配置已覆盖标头。

## 4. 配置说明

修改 `.env` 后运行 `docker compose up -d --wait`；HTTPS 部署加 `--profile https`。

| 配置 | 默认值 / 作用 |
| --- | --- |
| `COMPOSE_PROJECT_NAME` | `habit-hero`，决定卷命名，部署后不要随意改 |
| `HH_WEB_BIND` / `HH_WEB_PORT` | `127.0.0.1` / `4319`，网页监听地址和端口 |
| `HH_DOMAIN` | 示例域名，启用 HTTPS 前必须替换 |
| `HH_DB_PATH` | 容器内 `/data/habit-hero.sqlite`；恢复时换为新的 `/data/...` 路径 |
| `HH_GATEWAY_KEY` / `HH_EDGE_KEY` | setup 生成的两个独立随机内部密钥，至少 32 字符，勿公开 |
| `HH_REGISTRATION` | `invite`：仅服务器创建或有效家庭邀请；`open`：任何访问者都可注册，需明确选择 |
| `HH_MAX_USERS` / `HH_MAX_FAMILIES` | 全服务 100 个账户 / 100 个家庭；每账户最多加入/创建 5 个家庭 |
| `HH_ASSET_BYTES` | 每家庭附件合计 268435456（256 MiB）；单图 8 MiB |
| `HH_FAMILY_BYTES` | 每家庭记录、附件、同步历史、回执和导入计划合计 335544320（320 MiB）逻辑配额 |
| `HH_DB_MAX_BYTES` | SQLite 主库页数上限约 2 GiB；不包括 WAL、备份和基础镜像 |
| `HH_MIN_FREE_BYTES` | 低于 256 MiB 可用磁盘时暂停新增业务数据；提前监控容量 |

附加限制：每家庭最多 1000 个附件、20 个有效邀请、20 个儿童设备、5 份未完成导入预览；每账户保留最多 20 个家长会话。认证按可信来源每分钟 60 次、来源与用户名组合每分钟 10 次；普通写入每账户每分钟 120 次，附件/预览 20 次，儿童写入 30 次，改密/撤销验证 5 次。内存、CPU 和进程数量也在 Compose 中设有限制。网络攻击防护、宿主机磁盘报警和备份保留仍由部署者管理。

## 5. 从零开始使用

1. **登录并建家庭**：首次登录后填写家庭名，再添加孩子；家庭时区取创建浏览器时区。
2. **进入家长页**：选择孩子并进入「家长入口」。家长账户有管理权限，不再以默认四位 PIN 假装权限隔离。
3. **配置任务与奖励**：在习惯、奖励页创建项目，或在「设置」点「添加示例任务与奖励」。模板可选、可编辑、重复点击不重复添加，不包含作者家庭资料。
4. **孩子独立使用**：设置 →「启用儿童设备」→ 为当前孩子生成设备码。孩子在另一浏览器登录页展开「儿童设备登录」输入设备码。码 10 分钟内只能用一次，会话 30 天有效。
5. **共用一台设备**：可点「将本浏览器切换为儿童设备」。这会撤销本机家长会话、移除家长凭据；回到管理需退出儿童会话并重新用家长账户密码登录。不要在孩子设备的浏览器密码管理器中保存家长密码。家长账户直接浏览孩子页面只是预览，不会自动降低权限。
6. **提交与审批**：孩子点击完成任务，只生成待审批项。家长审批后增加积分；同一待办不能重复发放。儿童接口从服务端任务定义取名称和分值，不接受孩子自填积分。
7. **兑换奖励**：服务端按奖励定义价格扣分，不允许透支。重复请求/网络丢失响应只记一次。新兑换确认超过约两分钟须重新选择，恢复前的消费不自动重放。
8. **邀请家长**：设置 →「邀请家人」。把邀请码私下给对方；对方勾选注册并填写邀请码，或已有账户登录后选择加入。邀请码 24 小时有效、仅一次，加入者是家庭管理员。
9. **账户维护**：设置可改密码、撤销此账户所有会话、撤销儿童设备、移除其他家庭成员。改密撤销全部设备；成员移除即时阻止家庭访问，保留历史，最后一位管理员不能移除。

儿童会话只能读取自己的资料、提交习惯任务和兑换奖励，不能改配置、任意发积分、访问其他孩子、邀请成员、导入导出整个家庭或创建家庭。它是设备会话，不是可自行管理密码的儿童账户。家长设备需保持私密。

页面出现待确认提示时，先联网「核对并刷新」。未确认前不要清理浏览器数据；余额以服务端确认结果为准。浏览器仍可能保存已下载家庭资料，撤销访问不能远程擦除已下载的数据。

## 6. 账户丢失、空间与维护

部署者可在服务器运行：

```sh
bash scripts/account.sh reset-password my-parent
bash scripts/account.sh revoke-sessions my-parent
docker compose exec -T sync node server/src/admin.mjs storage
```

重置密码会撤销该账户全部家长和儿童会话。没有邮件找回功能；服务器操作权限即恢复权限，应仅交给可信部署者。

未引用附件可先盘点，再明确执行清理（先备份）：

```sh
docker compose exec -T sync node server/src/admin.mjs prune-assets FAMILY_ID
# 核对候选 hash 和字节数后才执行：
docker compose exec -T sync node server/src/admin.mjs prune-assets FAMILY_ID --apply
```

工具保留当前记录、同步历史和有效/已提交导入计划引用的附件，不删除账本、家庭记录或回执。不保证立即缩小数据库文件；SQLite 可复用空页。达到家庭历史配额时请评估扩容，不要随意删除旧回执，否则可能破坏幂等保证。备份目录不会自动轮转，需自行制定异机保存和保留策略。

## 7. 导入、备份与恢复

家长设置可导出整个家庭 JSON（含附件，不含登录 token）；导入支持家庭导出及兼容的旧 H5/iOS JSON。选择文件 → 对应孩子 → 核定余额与重复记录 → 预览 → 确认。不能直接用旧应用数据库替换本服务库。备份包含家庭资料，应私密保管。

在线一致性备份：

```sh
sh scripts/backup.sh
```

脚本执行 SQLite `VACUUM INTO`、完整性检查，保存到宿主机 `backups/habit-hero-时间.sqlite`，权限 600，另在数据卷保留一份。附件已包含；不要在运行中只复制主库而漏掉 WAL。定期复制到安全的异机位置，并实际演练恢复。

### 恢复到新数据库，保留原库

暂停家人的写入，先备份当前库。替换下面的备份路径：

```sh
BACKUP_FILE=backups/habit-hero-YYYYMMDDTHHMMSSZ.sqlite
RESTORE_ID=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T sync sh -c 'umask 077; set -C; cat > "$1"' sh "/data/restore-input-${RESTORE_ID}.sqlite" < "$BACKUP_FILE"
docker compose stop web sync
docker compose run --rm --no-deps sync node server/src/admin.mjs restore \
  "/data/restore-input-${RESTORE_ID}.sqlite" "/data/restored-${RESTORE_ID}.sqlite"
printf 'HH_DB_PATH=/data/restored-%s.sqlite\n' "$RESTORE_ID"
```

把最后输出的一行**替换**进 `.env` 的 `HH_DB_PATH`，再运行 `docker compose up -d --wait`（HTTPS 加 `--profile https`）。工具拒绝覆盖已有目标、检查完整性、更新数据代次，并撤销备份中的全部登录会话、儿童设备码和家庭邀请，避免恢复已撤销的凭据。恢复点之后改过密码的账户，需用恢复点时的密码或由部署者重置。

新浏览器登录后核对恢复日期、孩子、余额和附件。旧浏览器若有待确认操作或提示服务已恢复，使用「恢复旧浏览器」：

1. 下载恢复记录，包含旧队列、本机记录和能查询到的回执；未知或未找到回执不代表从未执行。
2. 确认文件已保存，再「归档并断开旧连接」。本机归档写入失败会停止，保留原操作。
3. 重新登录并选择家庭，对照导出文件与恢复后的流水，必要时由家长手动更正。**旧消费不会自动重放，恢复记录也不是可自动导入的账本。**

恢复失败可保持/改回原 `HH_DB_PATH` 启动原库。不要在两个已产生新写入的库之间随意切换。儿童设备需重新由家长发码连接。

## 8. 更新与排错

更新前备份，保留源码、`.env`、项目名和数据卷；检查发行说明及 `.env.example` 新配置。然后：

```sh
docker compose up -d --build --wait
docker compose logs --tail=100 sync web
```

停止用 `docker compose stop`，继续用 `docker compose up -d --wait`。**不要用 `down -v` 更新，也不要多实例共享写入同一个 SQLite 库。** Node 基线为 24.22.1，定期关注上游安全补丁、更新镜像与锁文件并重新测试，固定版本不是永久安全保证。

| 现象 | 处理 |
| --- | --- |
| 配置缺内部密钥 | 执行 setup；已有空白 `.env` 需生成并补齐两个独立密钥 |
| 端口被占用 | 修改 `HH_WEB_PORT`；检查 HTTPS 的 80/443 及 NAS 现有代理 |
| unhealthy / 502 | 查日志、Docker 卷权限、磁盘余量；默认上游是 `http://sync:4318` |
| 注册受控 | 服务器创建账号，或使用家人一次性邀请码 |
| 登录 429 | 等一分钟；确认可信代理覆盖来源标头，不能让所有用户都被识别成代理 |
| 密码忘记 | 部署者运行 reset-password，没有邮件找回 |
| 配额或磁盘不足 | 查 storage 与宿主机空间，盘点未引用附件，备份后清理或扩容 |
| 服务恢复 / 旧操作卡住 | 下载恢复记录、归档断开、重新登录并人工核定 |
| 手机访问失败 | 本机绑定/防火墙/DNS/证书是否正确；真实手机需另验收 |

## 9. 开发和验证

安装 Node.js **24.22.1 或更新的 24.x**，无需其他数据库；运行时用内置 SQLite。开发实例仍默认受控注册。

```sh
npm ci --prefix Habit_Hero_h5
npm run build --prefix Habit_Hero_h5
node --test server/test/*.test.mjs Habit_Hero_h5/tests/*.test.mjs
npm audit --prefix Habit_Hero_h5
```

启动服务与开发网页，在两个终端分别运行：

```sh
HH_DB_PATH=./data/dev.sqlite HOST=127.0.0.1 PORT=4318 node server/src/index.mjs
# 首次另开终端，通过 stdin 设置开发密码（不要在命令中写真实密码）：
# HH_DB_PATH=./data/dev.sqlite node server/src/admin.mjs create-user my-parent
```

```sh
cd Habit_Hero_h5
SYNC_SERVER_URL=http://127.0.0.1:4318 npm run dev
```

开发账户工具从标准输入读取密码；推荐生产使用上面的隐藏输入脚本。Vite 仅用于本机开发，生产由同源网关提供静态文件和 API。完整运行可在构建后执行 `SYNC_SERVER_URL=http://127.0.0.1:4318 HOST=127.0.0.1 PORT=4319 npm start`。

CI 执行功能、安全与恢复测试、类型检查和构建；Dependabot 每周提出依赖更新。测试使用临时数据库和合成数据；自动测试不等于公开渗透测试、真实手机验收或长期运行保证。许可证正文随静态成品提供，构建时自动生成第三方声明。
