// Модуль планировщика уведомлений
import schedule from 'node-schedule';
import { config } from '../config.js';
import { getRandomTipTopic } from './training.js';
import { generateMorningTip } from './ai.js';
import { getAllSubscribers, getUpcomingVaccinations, getSchedule, getAllSchedules } from './database.js';

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
 * Запланировать ежедневную проверку прививок (10:00)
 */
export function scheduleVaccinationCheck(bot) {
  const rule = new schedule.RecurrenceRule();
  rule.hour = 10;
  rule.minute = 0;
  rule.tz = 'Europe/Moscow';

  const job = schedule.scheduleJob(rule, async () => {
    console.log('💉 Проверка предстоящих прививок...');
    const subscribers = getAllSubscribers();
    
    for (const userId of subscribers) {
      const upcoming = getUpcomingVaccinations(userId);
      
      for (const vacc of upcoming) {
        // Проверяем, сколько дней осталось
        const daysLeft = Math.ceil((vacc.scheduled_date - Date.now()) / (1000 * 60 * 60 * 24));
        
        // Уведомляем за 3 дня, за 1 день и в день события
        if (daysLeft === 3 || daysLeft === 1 || daysLeft === 0) {
          const date = new Date(vacc.scheduled_date).toLocaleDateString('ru-RU');
          let msg = `🔔 *Напоминание о прививке*\n\n`;
          
          if (daysLeft === 0) msg += `❗ *СЕГОДНЯ:* ${vacc.vaccination_type}`;
          else msg += `⏳ *Через ${daysLeft} дн. (${date}):* ${vacc.vaccination_type}`;
          
          try {
            await bot.telegram.sendMessage(userId, msg, { parse_mode: 'Markdown' });
            console.log(`✅ Напоминание отправлено пользователю ${userId}`);
          } catch (error) {
            console.error(`❌ Ошибка отправки напоминания ${userId}:`, error.message);
          }
        }
      }
    }
  });
  
  console.log('📅 Проверка прививок запланирована на 10:00');
  return job;
}

// Хранилище активных задач расписания: Map<userId, List<Job>>
const userJobs = new Map();

/**
 * Инициализация всех расписаний при старте
 */
export function initDailySchedule(bot) {
  const schedules = getAllSchedules();
  // Группируем по user_id
  const userIds = new Set(schedules.map(s => s.user_id));
  
  console.log(`⏰ Загрузка расписания для ${userIds.size} пользователей...`);
  
  userIds.forEach(userId => {
    rescheduleUserEvents(bot, userId);
  });
}

/**
 * Пересоздать задачи расписания для пользователя
 */
export function rescheduleUserEvents(bot, userId) {
  // 1. Отменяем старые задачи
  const existingJobs = userJobs.get(userId) || [];
  existingJobs.forEach(job => job.cancel());
  userJobs.set(userId, []);

  // 2. Получаем актуальное расписание
  const events = getSchedule(userId);
  const newJobs = [];

  events.forEach(event => {
    const [hStr, mStr] = event.event_time.split(':');
    let hour = parseInt(hStr);
    let minute = parseInt(mStr);
    
    // Вычитаем 10 минут для напоминания
    let notifyDate = new Date();
    notifyDate.setHours(hour, minute - 10, 0, 0);
    
    const notifyHour = notifyDate.getHours();
    const notifyMinute = notifyDate.getMinutes();

    const rule = new schedule.RecurrenceRule();
    rule.hour = notifyHour;
    rule.minute = notifyMinute;
    rule.tz = 'Europe/Moscow';

    const job = schedule.scheduleJob(rule, async () => {
      const msg = `⏰ *Скоро по расписанию:* ${event.event_type} (${event.event_time})`;
      try {
        await bot.telegram.sendMessage(userId, msg, { parse_mode: 'Markdown' });
      } catch (e) {
        console.error(`Ошибка отправки напоминания ${userId}:`, e.message);
      }
    });
    
    if (job) newJobs.push(job);
  });

  userJobs.set(userId, newJobs);
  console.log(`✅ Расписание обновлено для ${userId}: ${newJobs.length} задач`);
}

/**
 * Отменить все запланированные задачи
 */
export function cancelAllJobs() {
  schedule.gracefulShutdown();
}
