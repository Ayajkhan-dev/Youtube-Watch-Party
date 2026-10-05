# Phase 13 server image: one stateless Node process. Compose scales this service to 3 replicas.
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
COPY shared/package.json shared/package.json
COPY server/package.json server/package.json
COPY client/package.json client/package.json
RUN npm install --include=dev

COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/package.json /app/package-lock.json* ./
COPY --from=build /app/shared/package.json shared/package.json
COPY --from=build /app/server/package.json server/package.json
COPY --from=build /app/client/package.json client/package.json
COPY --from=build /app/server/dist server/dist
COPY --from=build /app/shared/dist shared/dist
COPY --from=build /app/node_modules node_modules
EXPOSE 4000
CMD ["npm", "run", "start", "-w", "server"]
