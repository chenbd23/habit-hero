FROM node:26.13.0-bookworm-slim AS frontend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:26.13.0-bookworm-slim
WORKDIR /app
COPY --from=frontend-builder --chown=node:node /app/dist ./dist
COPY --chown=node:node server/server-sync.mjs ./server/server-sync.mjs
ENV NODE_ENV=production PORT=4000
EXPOSE 4000
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/server-sync.mjs"]
