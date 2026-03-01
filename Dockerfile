FROM node:20-alpine

WORKDIR /app

# Copy dependency manifests first for layer caching
COPY local-server/package-lock.json ./
COPY local-server/package.json ./

RUN npm ci --omit=dev

# Copy application source
COPY local-server/server.js ./
COPY local-server/public/ ./public/

ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
