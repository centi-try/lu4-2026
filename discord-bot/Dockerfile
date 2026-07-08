FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev || npm install --omit=dev
COPY . .
ENV NODE_ENV=production
# Registra el comando /vender y luego arranca el bot.
CMD ["sh", "-c", "node register-commands.mjs && node index.mjs"]
