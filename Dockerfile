FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
RUN apk add --no-cache python3 make g++
COPY package*.json ./
RUN npm ci --legacy-peer-deps
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/client/public ./client/public
RUN mkdir -p /data/backups /data/uploads
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
