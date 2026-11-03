# Habit Hero Sync 3.1.0

[中文部署与使用](../README.md) · [English setup and usage](../README.en.md)

Node.js 24.22.1+ (24.x), built-in SQLite, protocol v1. No npm runtime dependencies.
Node.js 24.22.1+（24.x）内置 SQLite，无需额外安装数据库或 npm 运行依赖。

Run from the repository root / 在仓库根目录运行：

```sh
HH_DB_PATH=./data/habit-hero.sqlite PORT=4318 node server/src/index.mjs
```

The API listens on all interfaces. Docker Compose keeps it on the internal network;
for native development, restrict access with your host firewall.
API 监听所有网卡；Compose 不发布它的宿主机端口。原生开发时请用宿主机防火墙限制访问。

```sh
node --test server/test/*.test.mjs
```

`src/admin.mjs` provides consistent online backups and restores to a new path.
See the root README for tested deployment, backup, and restore commands.
`src/admin.mjs` 支持在线一致性备份及恢复到新路径。完整操作步骤见根目录 README。
