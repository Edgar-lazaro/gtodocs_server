# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS deps
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci


FROM deps AS build
WORKDIR /app

COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src

RUN npx prisma generate
RUN npm run build


# Used by docker-compose to run migrations (keeps dev deps including prisma CLI)
FROM build AS migrate
WORKDIR /app


FROM build AS pruned
WORKDIR /app
RUN npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production

COPY --from=pruned /app/package.json ./package.json
COPY --from=pruned /app/node_modules ./node_modules
COPY --from=pruned /app/dist ./dist
COPY --from=pruned /app/prisma ./prisma

EXPOSE 3000
CMD ["node", "dist/main.js"]
