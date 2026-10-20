# Multi-stage build for Swalef Game
# Stage 1: Build Frontend (Vite)
FROM node:20-slim AS client-builder
WORKDIR /app/client

COPY client/package*.json ./
RUN npm install

COPY client/ ./
RUN npm run build

# Stage 2: Production Server
FROM node:20-slim
WORKDIR /app

# Install build dependencies for better-sqlite3 native compilation if needed
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install server dependencies
COPY server/package*.json ./server/
RUN cd server && npm install

# Copy server code
COPY server/ ./server/

# Copy built frontend assets to client/dist
COPY --from=client-builder /app/client/dist ./client/dist

ENV NODE_ENV=production

CMD ["node", "server/index.js"]
