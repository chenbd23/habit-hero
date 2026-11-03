FROM node:26.13.0-bookworm-slim
WORKDIR /app
COPY --chown=node:node server/package.json server/package.json
COPY --chown=node:node server/src server/src
COPY --chown=node:node shared shared
COPY --chown=node:node LICENSE ./LICENSE
COPY --chown=node:node server/licenses ./licenses
RUN mkdir /data && chown node:node /data
ENV NODE_ENV=production PORT=4318 HH_DB_PATH=/data/habit-hero.sqlite
USER node
EXPOSE 4318
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s CMD node -e "fetch('http://127.0.0.1:4318/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/src/index.mjs"]
