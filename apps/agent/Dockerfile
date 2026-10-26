# Build from the repository root:  docker build -f apps/agent/Dockerfile -t shrim-agent .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/ui/package.json packages/ui/
COPY apps/agent/package.json apps/agent/
RUN pnpm install --frozen-lockfile --filter @shrim/agent... --ignore-scripts
COPY packages packages
COPY apps/agent apps/agent
RUN pnpm --filter @shrim/agent build

# The build is self-contained: no node_modules needed at runtime.
FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/apps/agent/build build
COPY scripts/serve.mjs serve.mjs
RUN mkdir /data && chown node:node /data
USER node
ENV DATA_DIR=/data \
    IMMICH_URL=http://immich-server:2283
ENV NODE_ENV=production PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "serve.mjs", "build"]
