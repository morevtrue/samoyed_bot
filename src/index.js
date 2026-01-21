// Главный файл Telegram-бота Samoyed Mentor
import { Telegraf, Markup } from 'telegraf';
import { config } from '../config.js';
import { 
  initDatabase, 
  subscribeUser,
  setPuppyBirthDate,
  getPuppyBirthDate,
  logWeight,
  addScheduleItem,
  setPuppyName,
  getPuppyName,
  resetUserData
} from './database.js';
import { askExpert } from './ai.js';
import { scheduleMorningTip, scheduleVaccinationCheck, initDailySchedule, rescheduleUserEvents } from './scheduler.js';
import { logger } from './logger.js';

// Импорт обработчиков
import { initFeedingHandlers } from './handlers/feeding.js';
import { initActivityHandlers } from './handlers/activity.js';
import { initTrainingHandlers } from './handlers/training.js';
import { initHealthHandlers } from './handlers/health.js';
import { initScheduleHandlers } from './handlers/schedule.js';
import { initAssistanceHandlers } from './handlers/assistance.js';

// Создание бота
const bot = new Telegraf(config.botToken);

// Управление состоянием
const userAiMode = new Map();
const userBirthDateParams = new Map(); // Ожидание ввода даты рождения { userId: true }
const userWeightParams = new Map(); // Ожидание ввода веса { userId: true }
const userRegistrationState = new Map(); // Ожидание ввода имени щенка { userId: true }
const userRegistrationDateState = new Map(); // Ожидание ввода даты при регистрации { userId: true }
const userScheduleParams = new Map(); // { userId: { type: 'feeding' } }

// Обработка ошибок
bot.catch((err, ctx) => {
  if (err.message.includes('query is too old')) {
    logger.info('Skipped outdated callback query');
    return;
  }
  logger.error('Bot error', {
    error: err.message,
    userId: ctx.from?.id,
  });
});

// Константы клавиатур
const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('🦴 Питание', 'menu_feeding'), Markup.button.callback('🌳 Прогулки', 'menu_walks')],
  [Markup.button.callback('🎓 Тренировки', 'menu_training')],
  [Markup.button.callback('💉 Прививки', 'menu_vaccinations'), Markup.button.callback('⚖️ Вес', 'menu_weight')],
  [Markup.button.callback('⏰ Режим дня', 'menu_schedule')],
  [Markup.button.callback('🧠 AI-Эксперт', 'menu_ai'), Markup.button.callback('🆘 Паника', 'menu_sos')]
]);

const MENU_BUTTON = Markup.inlineKeyboard([
  [Markup.button.callback('📋 Меню', 'menu_main')]
]);

// Инициализация модулей и получение функций меню
initFeedingHandlers(bot);
initActivityHandlers(bot);
initTrainingHandlers(bot);
const { showVaccinationMenu, showWeightMenu } = initHealthHandlers(bot, userBirthDateParams, userWeightParams);
const { showScheduleMenu } = initScheduleHandlers(bot, userScheduleParams);
initAssistanceHandlers(bot, userAiMode);

// ============================================
// Команда /start
// ============================================

const getWelcomeMessage = (firstName, puppyName) => `🐕 Привет, ${firstName} и ${puppyName}!
  
    Я *Samoyed Mentor* — твой помощник.
  
    Самоеды — замечательные, но упрямые компаньоны. Я помогу тебе:
    • Получать ежедневные задания для тренировок
    • Отслеживать кормления и прогулки
    • Находить ответы на вопросы о поведении
    • Справляться с проблемами (кусание, лай)
  
    Каждое утро в 9:00 я буду присылать полезный совет!
  
    Выбери, что тебя интересует:
  `;

// Команда /reset
bot.command('reset', async (ctx) => {
  const userId = ctx.from.id;
  resetUserData(userId);
  
  // Очищаем локальные состояния
  userRegistrationState.delete(userId);
  userRegistrationDateState.delete(userId);
  userBirthDateParams.delete(userId);
  userWeightParams.delete(userId);
  userScheduleParams.delete(userId);
  userAiMode.delete(userId);
  
  await ctx.reply('🗑️ Ваши данные удалены. Отправьте /start, чтобы начать заново.');
});

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'друг';
  
  subscribeUser(userId);
  
  const puppyName = getPuppyName(userId);
  
  if (!puppyName) {
    userRegistrationState.set(userId, true);
    return ctx.reply(`👋 Привет, ${firstName}!\n\nЯ твой помощник в воспитании самоеда.\n\nДавай познакомимся! Как зовут твоего щенка? 🐶\n_(Напиши имя в ответ)_`);
  }
  
  await ctx.reply(getWelcomeMessage(firstName, puppyName), { 
    parse_mode: 'Markdown',
    ...MAIN_MENU
  });
});

// Вернуться в главное меню (общий обработчик)
bot.action('menu_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('🐕 *Samoyed Mentor*\n\nГлавное меню: питание, тренировки, здоровье и советы. Чем займемся сейчас?', {
    parse_mode: 'Markdown',
    ...MAIN_MENU
  });
});

// ============================================
// Обработчик текстовых сообщений (Inputs + AI)
// ============================================

bot.on('text', async (ctx) => {
  const userId = ctx.from.id;
  const text = ctx.message.text;

  // 1. Регистрация имени
  const isRegistration = userRegistrationState.get(userId);
  
  if (isRegistration) {
    const name = text.trim();
    if (name.length < 2 || name.length > 30) {
      return ctx.reply('⚠️ Имя должно быть от 2 до 30 символов. Попробуйте снова.');
    }
    
    setPuppyName(userId, name);
    userRegistrationState.delete(userId);
    
    // Переходим к следующему шагу - дате рождения
    userRegistrationDateState.set(userId, true);
    
    await ctx.reply(`Приятно познакомиться с ${name}! 🤝\n\nА теперь укажите дату рождения в формате ДД.ММ.ГГГГ\n(например: 20.12.2025):`);
    return;
  }

  // 1.1 Регистрация даты рождения
  if (userRegistrationDateState.get(userId)) {
    const dateRegex = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
    const match = text.match(dateRegex);
    
    if (!match) {
      return ctx.reply('⚠️ Неверный формат. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например 25.05.2025)');
    }
    
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const year = parseInt(match[3]);
    
    const date = new Date(year, month, day);
    
    if (isNaN(date.getTime()) || day > 31 || month > 11) {
       return ctx.reply('⚠️ Некорректная дата. Проверьте правильность.');
    }
    
    setPuppyBirthDate(userId, date.getTime());
    userRegistrationDateState.delete(userId);
    
    const puppyName = getPuppyName(userId) || 'пушистик'; // На всякий случай
    
    await ctx.reply(getWelcomeMessage(ctx.from.first_name || 'друг', puppyName), {
      parse_mode: 'Markdown',
      ...MAIN_MENU
    });
    return;
  }

  // 2. Ввод даты рождения
  if (userBirthDateParams.get(userId)) {
    const dateRegex = /^(\d{2})\.(\d{2})\.(\d{4})$/;
    const match = text.match(dateRegex);
    
    if (!match) {
      return ctx.reply('⚠️ Неверный формат. Пожалуйста, введите дату в формате ДД.ММ.ГГГГ (например 25.05.2025)');
    }
    
    const day = parseInt(match[1]);
    const month = parseInt(match[2]) - 1;
    const year = parseInt(match[3]);
    
    const date = new Date(year, month, day);
    
    if (isNaN(date.getTime()) || day > 31 || month > 11) {
       return ctx.reply('⚠️ Некорректная дата. Проверьте правильность.');
    }
    
    setPuppyBirthDate(userId, date.getTime());
    userBirthDateParams.delete(userId);
    
    await ctx.reply('✅ Дата рождения сохранена! График прививок рассчитан.', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🧮 В калькулятор корма', 'calc_food_start')],
        [Markup.button.callback('💉 Меню прививок', 'menu_vaccinations')],
        [Markup.button.callback('« Главное меню', 'menu_main')]
      ])
    });
    // return showVaccinationMenu(ctx, userId); // Убираем авто-редирект
  }

  // 3. Ввод веса
  if (userWeightParams.get(userId)) {
    const weight = parseFloat(text.replace(',', '.'));
    
    if (isNaN(weight) || weight <= 0 || weight > 100) {
      return ctx.reply('⚠️ Пожалуйста, введите корректный вес в кг (число, например 12.5).');
    }
    
    // Получаем возраст для лога
    const data = getPuppyName(userId); // просто проверка существования, реально нам нужна дата
    // В БД нет функции getPuppyBirthDate которая возвращает объект, она возвращает timestamp.
    // Нам нужно импортировать getPuppyBirthDate из database.js (уже есть)
    const birthDate = getPuppyBirthDate(userId);
    let ageWeeks = 0;
    
    if (birthDate) {
      const diff = Date.now() - birthDate;
      ageWeeks = Math.floor(diff / (1000 * 60 * 60 * 24 * 7));
    }
    
    logWeight(userId, weight, ageWeeks);
    userWeightParams.delete(userId);
    
    let msg = `✅ Вес *${weight} кг* сохранен!`;
    if (ageWeeks > 0) msg += ` (Возраст: ${ageWeeks} недель)`;
    else msg += '\n⚠️ _Рекомендуем заполнить дату рождения в разделе "Прививки" для отслеживания норм._';
    
    await ctx.reply(msg, { 
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🧮 Пересчитать корм', 'calc_food_start')],
        [Markup.button.callback('⚖️ Меню веса', 'menu_weight')],
        [Markup.button.callback('« Главное меню', 'menu_main')]
      ])
    });
    // return showWeightMenu(ctx, userId); // Убираем авто-редирект
  }

  // 4. Ввод времени для расписания
  const scheduleParams = userScheduleParams.get(userId);
  if (scheduleParams) {
    const timeRegex = /^(\d{1,2})[:\.\-\s](\d{2})$/;
    const match = text.match(timeRegex);
    
    if (!match) {
      return ctx.reply('⚠️ Неверный формат времени. Введите время в формате ЧЧ:ММ (например 08:30 или 14.00)');
    }
    
    let hour = parseInt(match[1]);
    const minute = parseInt(match[2]);
    
    if (hour > 23 || minute > 59) {
      return ctx.reply('⚠️ Некорректное время. Часы 0-23, минуты 0-59.');
    }
    
    const timeStr = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
    
    addScheduleItem(userId, scheduleParams.type, timeStr);
    userScheduleParams.delete(userId);
    
    rescheduleUserEvents(bot, userId);
    
    await ctx.reply(`✅ Событие "${scheduleParams.type}" добавлено на ${timeStr}! Буду напоминать за 10 минут.`);
    return showScheduleMenu(ctx, userId);
  }

  // 5. AI Вопросы
  const question = ctx.message.text;
  if (question.startsWith('/')) return;
  
  const aiMode = userAiMode.get(userId);
  if (!aiMode) return; 
  
  await ctx.sendChatAction('typing');
  
  try {
    const answer = await askExpert(question, aiMode);
    
    await ctx.reply(answer, {
      parse_mode: 'Markdown',
      ...MENU_BUTTON
    });
    userAiMode.delete(userId);
    
  } catch (error) {
    console.error('Ошибка обработки вопроса:', error);
    await ctx.reply('😔 Произошла ошибка. Попробуйте ещё раз.');
    userAiMode.delete(userId);
  }
});

// ============================================
// Main
// ============================================

async function main() {
  await initDatabase();
  
  // Запуск планировщика
  scheduleMorningTip(bot);
  scheduleVaccinationCheck(bot);
  initDailySchedule(bot);

  // Запуск бота
  await bot.launch();
  console.log('🐕 Samoyed Mentor Bot запущен!');
  console.log('Нажмите Ctrl+C для остановки');
}

main().catch((error) => {
  console.error('❌ Ошибка запуска бота:', error.message);
  process.exit(1);
});

// Graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
