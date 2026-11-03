# Habit Hero H5 3.2.0

[中文部署与使用](../README.md) · [English setup and usage](../README.en.md)

Vue 3 + TypeScript + Vite, with a Node.js same-origin API gateway.
Vue 3 + TypeScript + Vite 前端，使用 Node.js 同源 API 网关。

Development / 开发（先启动同步服务）：

```sh
npm ci
SYNC_SERVER_URL=http://127.0.0.1:4318 npm run dev
```

Build and run / 构建和启动：

```sh
npm run build
SYNC_SERVER_URL=http://127.0.0.1:4318 PORT=4319 npm start
```

Then open / 打开 `http://127.0.0.1:4319`。

Tests require the built UI and the sibling `server/` and `shared/` directories.
测试需要先构建网页，并保留同级 `server/` 和 `shared/` 目录。

```sh
npm test
```

`SYNC_SERVER_URL` must be an HTTP(S) origin reachable from the gateway, without
credentials, `/api/v1`, query strings, or fragments. Do not use `vite preview`
as a full deployment: it does not provide this production API gateway.
`SYNC_SERVER_URL` 必须是网关可访问的 HTTP(S) 根地址，不含凭据、`/api/v1`、查询参数或片段。
`vite preview` 不提供生产 API 网关，不能单独作为完整部署。
