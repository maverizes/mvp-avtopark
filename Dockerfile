# JoyBor — bitta konteyner: Node 24 (ichida SQLite). Baza: ./data dagi fayl yoki Turso.
FROM node:24-alpine

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/app/data/joybor.db

WORKDIR /app
COPY package.json package-lock.json ./
# Turso ulansa kerak bo'ladigan mijoz (lokal SQLite uchun paket kerak emas)
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY public ./public
COPY seed ./seed

# Baza tashqi diskda saqlanadi; ilova root bo'lmagan foydalanuvchida ishlaydi
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
VOLUME ["/app/data"]
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
