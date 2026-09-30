FROM node:20-bookworm-slim AS builder
WORKDIR /app

# better-sqlite3 needs a native build step (node-gyp) — the compiler toolchain
# lives only in this stage and never reaches the final image.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-bookworm-slim
WORKDIR /app

# Same base image as the builder stage so the compiled better-sqlite3 binary
# (glibc/Node ABI-specific) is guaranteed compatible.
COPY --from=builder /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# Fail-closed: JWT_SECRET is required in production (see server.js) — pass it
# with `docker run -e JWT_SECRET=...`. Same for ANTHROPIC_API_KEY,
# ALLOWED_ORIGINS, and any notification env vars you want active.
EXPOSE 5000
EXPOSE 1883

CMD ["node", "server.js"]
