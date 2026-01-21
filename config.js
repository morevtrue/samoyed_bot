// Модуль конфигурации
import 'dotenv/config';

export const config = {
  // Telegram Bot
  botToken: process.env.BOT_TOKEN,
  
  // GitHub Models API
  githubToken: process.env.GITHUB_TOKEN,
  
  // База данных
  databasePath: process.env.DATABASE_PATH || './data/bot.db',
  
  // Время утреннего совета (часы, минуты)
  morningTipTime: { hour: 9, minute: 0 }
};
