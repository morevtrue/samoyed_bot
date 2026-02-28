FROM node:20-alpine

# Установка часового пояса МСК
ENV TZ=Europe/Moscow

WORKDIR /app

# Копируем зависимости отдельно для кэширования слоёв
COPY package*.json ./

# Устанавливаем только production-зависимости
RUN npm ci --only=production

# Копируем исходный код
COPY src/ ./src/
COPY config.js ./

# Создаём директорию для базы данных и выставляем права
RUN mkdir -p /app/data && chown -R node:node /app

# Запускаем от непривилегированного пользователя
USER node

# Проверка работоспособности: процесс node запущен
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD pgrep -f "node src/index.js" || exit 1

CMD ["node", "src/index.js"]
