# Build from the repository root:  docker build -f apps/relay/Dockerfile -t shrim-relay .
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /src
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/protocol/package.json packages/protocol/
COPY packages/ui/package.json packages/ui/
COPY apps/relay/package.json apps/relay/
RUN pnpm install --frozen-lockfile --filter @shrim/relay... --ignore-scripts
COPY packages packages
COPY apps/relay apps/relay
RUN pnpm --filter @shrim/relay build

# The build is self-contained: no node_modules needed at runtime.
FROM node:22-alpine
WORKDIR /app
COPY --from=build /src/apps/relay/build build
# The example album's photos (SHRIM_DEMO). Not under build/, so never served as plain files.
COPY --from=build /src/apps/relay/demo demo
COPY scripts/serve.mjs serve.mjs
RUN mkdir /data && chown node:node /data
USER node
ENV SHRIM_DATA_DIR=/data
ENV NODE_ENV=production PORT=3000
VOLUME /data
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "serve.mjs", "build"]
