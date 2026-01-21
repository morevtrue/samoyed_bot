// Модуль планировщика уведомлений
import schedule from 'node-schedule';
import { config } from '../config.js';
import { getRandomTipTopic } from './training.js';
import { generateMorningTip } from './ai.js';
import { getAllSubscribers } from './database.js';

/**
 * Запланировать утреннюю рассылку советов (генерация через AI)
 */
export function scheduleMorningTip(bot) {
  const { hour, minute } = config.morningTipTime;
  
  // Формат cron: секунды минуты часы день месяц день_недели
  const rule = new schedule.RecurrenceRule();
  rule.hour = hour;
  rule.minute = minute;
  rule.tz = 'Europe/Moscow';

  const job = schedule.scheduleJob(rule, async () => {
    console.log('⏰ Запуск утренней рассылки советов...');
    
    // Выбираем случайную тему и генерируем совет через AI
    const topic = getRandomTipTopic();
    console.log(`📝 Тема сегодня: ${topic}`);
    
    const tip = await generateMorningTip(topic);
    const message = `🌅 *Доброе утро!*\n\n${tip}`;
    
    const subscribers = getAllSubscribers();
    
    for (const chatId of subscribers) {
      try {
        await bot.telegram.sendMessage(chatId, message, { parse_mode: 'Markdown' });
        console.log(`✅ Совет отправлен пользователю ${chatId}`);
      } catch (error) {
        console.error(`❌ Ошибка отправки пользователю ${chatId}:`, error.message);
      }
    }
    
    console.log(`📨 Рассылка завершена: ${subscribers.length} пользователей`);
  });

  console.log(`📅 Утренний совет запланирован на ${hour}:${String(minute).padStart(2, '0')} (Europe/Moscow)`);
  
  return job;
}

/**
 * Отменить все запланированные задачи
 */
export function cancelAllJobs() {
  schedule.gracefulShutdown();
}
