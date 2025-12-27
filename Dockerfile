# syntax=docker/dockerfile:1

# ===== Base stage =====
FROM node:20-alpine AS base
WORKDIR /app

# ===== Dependencies stage =====
FROM base AS deps
RUN apk add --no-cache libc6-compat

COPY package.json package-lock.json ./
RUN npm ci

# ===== Builder stage =====
FROM base AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Build Next.js
RUN npm run build

# ===== Production stage =====
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV HOSTNAME="0.0.0.0"

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy necessary files
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy custom server and its dependencies
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

# Set correct permissions
RUN chown -R nextjs:nodejs /app

USER nextjs

EXPOSE 8080

CMD ["npx", "tsx", "server.ts"]
