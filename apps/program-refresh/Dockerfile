FROM oven/bun:1.3.14 AS build
WORKDIR /workspace
COPY package.json bun.lock tsconfig.json ./
COPY packages/program-core/package.json packages/program-core/package.json
COPY apps/program-refresh/package.json apps/program-refresh/package.json
COPY apps/web/package.json apps/web/package.json
RUN bun install --frozen-lockfile
COPY packages/program-core packages/program-core
COPY apps/program-refresh apps/program-refresh
RUN bun run build:job

FROM node:24.13.0-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /workspace/apps/program-refresh/dist/main.js ./dist/main.js
USER node
CMD ["node", "dist/main.js"]
