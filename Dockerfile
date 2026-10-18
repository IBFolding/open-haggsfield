FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8080 STUDIO_DATA_DIR=/data
COPY --from=build /app/package*.json ./
RUN npm ci --omit=dev && mkdir /data && chown node:node /data
COPY --from=build /app/server ./server
COPY --from=build /app/dist/client ./dist/client
USER node
VOLUME /data
EXPOSE 8080
CMD ["node","server/start.mjs"]
