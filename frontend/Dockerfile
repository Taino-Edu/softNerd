FROM node:25-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
# scripts/ deve ser copiado antes do npm ci pois o postinstall chama scripts/patch-next.js
COPY scripts/ ./scripts/
RUN npm ci --legacy-peer-deps

FROM node:25-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
# CACHEBUST invalida o cache do COPY a cada deploy sem re-baixar npm
ARG CACHEBUST=1
RUN echo "Build: $CACHEBUST"
COPY . .

# API_URL é passado via --build-arg no docker-compose (ou docker build).
# NEXT_PUBLIC_ vars são baked no build — devem refletir o endereço público da API
# que o BROWSER vai acessar (não o nome interno do container Docker).
ARG API_URL=http://localhost:5000
ENV NEXT_PUBLIC_API_URL=$API_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:25-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
ENV PORT=3000
CMD ["node", "server.js"]
