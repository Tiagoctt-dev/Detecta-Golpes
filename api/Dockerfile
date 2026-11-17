FROM node:22.11.0-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/risk-engine/package.json packages/risk-engine/
COPY api/package.json api/
RUN npm ci --no-audit --no-fund
COPY packages/risk-engine packages/risk-engine
COPY api api
RUN npm run build -w @detecta/risk-engine && npm run build -w @detecta/api \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:22.11.0-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/packages/risk-engine/package.json packages/risk-engine/
COPY --from=build /app/packages/risk-engine/dist packages/risk-engine/dist
COPY --from=build /app/api/package.json api/
COPY --from=build /app/api/dist api/dist
COPY --from=build /app/api/migrations api/migrations
WORKDIR /app/api
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
