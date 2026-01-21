// Простой логгер в файл
import fs from 'fs';
import path from 'path';

const LOG_DIR = './logs';
const LOG_FILE = path.join(LOG_DIR, 'bot.log');

// Создаём папку logs если её нет
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

/**
 * Логирование в файл и консоль
 * @param {string} level - Уровень: INFO, WARN, ERROR
 * @param {string} message - Сообщение
 * @param {object} meta - Дополнительные данные
 */
export function log(level, message, meta = {}) {
  const timestamp = new Date().toISOString();
  const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
  const logEntry = `${timestamp} [${level}] ${message} ${metaStr}\n`;
  
  // Пишем в файл
  fs.appendFileSync(LOG_FILE, logEntry);
  
  // Дублируем в консоль (для разработки)
  if (level === 'ERROR') {
    console.error(logEntry.trim());
  } else if (level === 'WARN') {
    console.warn(logEntry.trim());
  } else {
    console.log(logEntry.trim());
  }
}

// Удобные алиасы
export const logger = {
  info: (message, meta) => log('INFO', message, meta),
  warn: (message, meta) => log('WARN', message, meta),
  error: (message, meta) => log('ERROR', message, meta),
};
