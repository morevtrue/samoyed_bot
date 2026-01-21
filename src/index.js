// Главный файл Telegram-бота Samoyed Mentor
import { Telegraf, Markup } from 'telegraf';
import { config } from '../config.js';
import { 
  initDatabase, 
  logFeeding, 
  getLastFeeding, 
  logWalk, 
  getWalkStats,
  subscribeUser,
  updateCommandProgress,
  getCommandProgress
} from './database.js';
import { 
  getDailyPlan, 
  formatDailyPlan, 
  KNOWLEDGE_BASE, 
  getPanicTopics, 
  getPanicAdvice
} from './training.js';
import { askExpert, generateMorningTip } from './ai.js';
import { scheduleMorningTip } from './scheduler.js';

// Создание бота
const bot = new Telegraf(config.botToken);

// Управление состоянием AI для каждого пользователя
// null = режим неактивен, 'normal' = обычный вопрос, 'emergency' = экстренная ситуация
const userAiMode = new Map();


// Обработка ошибок (включая устаревшие callback-запросы)
bot.catch((err, ctx) => {
  // Игнорируем ошибки устаревших callback-запросов при перезапуске бота
  if (err.message.includes('query is too old')) {
    console.log('⏰ Пропущен устаревший callback-запрос');
    return;
  }
  console.error('❌ Ошибка бота:', err.message);
});

// ============================================
// Константы клавиатур
// ============================================

// Главное меню (полное)
const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('📋 План на сегодня', 'menu_plan')],
  [Markup.button.callback('📊 Трекер', 'menu_tracker')],
  [Markup.button.callback('📚 База знаний', 'menu_knowledge')],
  [Markup.button.callback('🤖 Спросить AI', 'menu_ai')],
  [Markup.button.callback('🆘 SOS', 'menu_sos')]
]);

// Компактная кнопка меню (для ответов)
const MENU_BUTTON = Markup.inlineKeyboard([
  [Markup.button.callback('📋 Меню', 'menu_main')]
]);

// Кнопка "Назад в меню" (для подменю)
const BACK_BUTTON = [Markup.button.callback('« Главное меню', 'menu_main')];

// ============================================
// Команда /start
// ============================================

bot.start(async (ctx) => {
  const userId = ctx.from.id;
  const firstName = ctx.from.first_name || 'друг';
  
  // Подписываем на утренние уведомления
  subscribeUser(userId);
  
  const welcomeText = `🐕 Привет, ${firstName}!

    Я *Samoyed Mentor* — твой помощник в воспитании щенка самоеда.

    Самоеды — замечательные, но упрямые компаньоны. Я помогу тебе:
    • Получать ежедневные задания для тренировок
    • Отслеживать кормления и прогулки
    • Находить ответы на вопросы о поведении
    • Справляться с проблемами (кусание, лай)

    Каждое утро в 9:00 я буду присылать полезный совет!

    Выбери, что тебя интересует:
  `;

  await ctx.reply(welcomeText, { 
    parse_mode: 'Markdown',
    ...MAIN_MENU
  });
});

// ============================================
// Обработчики главного меню
// ============================================

// План на сегодня
bot.action('menu_plan', async (ctx) => {
  await ctx.answerCbQuery();
  
  const tasks = getDailyPlan(3);
  const text = formatDailyPlan(tasks);
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🔄 Новые задания', 'menu_plan')],
      [Markup.button.callback('« Главное меню', 'menu_main')]
    ])
  });
});

// Трекер
bot.action('menu_tracker', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  const lastFeeding = getLastFeeding(userId);
  const walkStats = getWalkStats(userId, 0); // Статистика за сегодня (0 дней назад от начала дня)
  
  let feedingInfo = 'ещё не кушал';
  if (lastFeeding) {
    const date = new Date(lastFeeding.fed_at + 'Z');
    feedingInfo = date.toLocaleString('ru-RU', { 
      timeZone: 'Europe/Moscow',
      hour: '2-digit', 
      minute: '2-digit'
    });
  }
  
  const totalEvents = walkStats?.total || 0;
  const reliableWalks = walkStats?.successful || 0;
  const accidents = totalEvents - reliableWalks;

  const text = `📊 *Трекер щенка*

🍖 *Дали покушать:* ${feedingInfo}

🚽 *Туалет щенка (сегодня):*
✅ Сходил на улице: ${reliableWalks}
💦 Промахи дома: ${accidents}

Отмечайте события кнопками ниже:`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('🍽️ Покормили', 'track_feed')],
      [
        Markup.button.callback('✅ Сходил в туалет на улице', 'track_walk_ok'),
        Markup.button.callback('💦 Лужа дома', 'track_walk_fail')
      ],
      [Markup.button.callback('« Главное меню', 'menu_main')]
    ])
  });
});

// Функция создания меню базы знаний (кешированная)
let cachedKnowledgeMenu = null;
function createKnowledgeMenu() {
  if (!cachedKnowledgeMenu) {
    const buttons = Object.entries(KNOWLEDGE_BASE).map(([key, cat]) => 
      [Markup.button.callback(cat.title, `kb_cat_${key}`)]
    );
    buttons.push(BACK_BUTTON);
    cachedKnowledgeMenu = Markup.inlineKeyboard(buttons);
  }
  return cachedKnowledgeMenu;
}

// База знаний — категории
bot.action('menu_knowledge', async (ctx) => {
  await ctx.answerCbQuery();
  
  await ctx.editMessageText('📚 *База знаний*\n\nВыберите категорию:', {
    parse_mode: 'Markdown',
    ...createKnowledgeMenu()
  });
});

// AI-ассистент
bot.action('menu_ai', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  userAiMode.set(userId, 'normal');
  
  const text = `🤖 *AI-ассистент по самоедам*

✅ Режим активирован! Напишите любой вопрос о вашем щенке, и я помогу!

Примеры вопросов:
• Как отучить кусаться?
• Сколько раз в день кормить?
• Почему он воет?
• Как приучить к поводку?

_Просто напишите сообщение в чат:_`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('« Главное меню', 'menu_main')]
    ])
  });
});

// SOS — экстренная помощь
bot.action('menu_sos', async (ctx) => {
  await ctx.answerCbQuery();
  
  const topics = getPanicTopics();
  const buttons = topics.map(t => 
    [Markup.button.callback(t.title, `sos_${t.key}`)]
  );
  buttons.push([Markup.button.callback('✍️ Написать свою проблему', 'sos_custom')]);
  buttons.push([Markup.button.callback('« Главное меню', 'menu_main')]);
  
  await ctx.editMessageText('🆘 *Экстренная помощь*\n\nЧто случилось?', {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

// SOS — написать свою проблему
bot.action('sos_custom', async (ctx) => {
  await ctx.answerCbQuery();
  
  const userId = ctx.from.id;
  userAiMode.set(userId, 'emergency');
  
  const text = `🆘 *Напишите свою проблему*

⚠️ Экстренный режим активирован! Опишите, что случилось с вашим самоедом, и я помогу найти решение.

Примеры:
• Щенок не ест уже 2 дня
• Боится выходить на улицу после прививки
• Агрессивно реагирует на других собак

_Просто напишите сообщение в чат:_`;

  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('« Назад к SOS', 'menu_sos')],
      [Markup.button.callback('« Главное меню', 'menu_main')]
    ])
  });
});

// Вернуться в главное меню
bot.action('menu_main', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('🐕 *Samoyed Mentor*\n\nВыберите раздел:', {
    parse_mode: 'Markdown',
    ...MAIN_MENU
  });
});

// ============================================
// Обработчики трекера
// ============================================

bot.action('track_feed', async (ctx) => {
  const userId = ctx.from.id;
  logFeeding(userId);
  await ctx.answerCbQuery('🍽️ Кормление записано!');
  // Перерисовываем трекер
  ctx.match = null; // сброс для повторного вызова
  await bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'menu_tracker' } });
});

bot.action('track_walk_ok', async (ctx) => {
  const userId = ctx.from.id;
  logWalk(userId, true);
  await ctx.answerCbQuery('✅ Успешная прогулка записана! Молодец!');
  await bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'menu_tracker' } });
});

bot.action('track_walk_fail', async (ctx) => {
  const userId = ctx.from.id;
  logWalk(userId, false);
  await ctx.answerCbQuery('❌ Записано. Не расстраивайся, в следующий раз получится!');
  await bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'menu_tracker' } });
});

// ============================================
// Обработчики базы знаний
// ============================================

// Отображение категории
bot.action(/^kb_cat_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  
  const categoryKey = ctx.match[1];
  const category = KNOWLEDGE_BASE[categoryKey];
  
  if (!category) {
    return ctx.reply('Категория не найдена');
  }
  
  const buttons = category.items.map((item, index) => 
    [Markup.button.callback(item.name, `kb_item_${categoryKey}_${index}`)]
  );
  buttons.push([Markup.button.callback('« Назад', 'menu_knowledge')]);
  
  await ctx.editMessageText(`${category.title}\n\nВыберите тему:`, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard(buttons)
  });
});

// Отображение статьи
bot.action(/^kb_item_(.+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  
  const categoryKey = ctx.match[1];
  const itemIndex = parseInt(ctx.match[2]);
  const category = KNOWLEDGE_BASE[categoryKey];
  
  if (!category || !category.items[itemIndex]) {
    return ctx.reply('Статья не найдена');
  }
  
  const item = category.items[itemIndex];
  const text = `*${item.name}*\n\n${item.text}`;
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('« Назад', `kb_cat_${categoryKey}`)],
      [Markup.button.callback('« Главное меню', 'menu_main')]
    ])
  });
});

// ============================================
// Обработчики SOS
// ============================================

bot.action(/^sos_(.+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  
  const issue = ctx.match[1];
  const advice = getPanicAdvice(issue);
  
  if (!advice) {
    return ctx.reply('Совет не найден');
  }
  
  let text = `${advice.title}\n\n*Что делать:*\n\n`;
  advice.tips.forEach((tip, i) => {
    text += `${i + 1}. ${tip}\n`;
  });
  
  await ctx.editMessageText(text, {
    parse_mode: 'Markdown',
    ...Markup.inlineKeyboard([
      [Markup.button.callback('« Назад', 'menu_sos')],
      [Markup.button.callback('« Главное меню', 'menu_main')]
    ])
  });
});

// ============================================
// Обработчик текстовых сообщений (OpenAI)
// ============================================

bot.on('text', async (ctx) => {
  const question = ctx.message.text;
  const userId = ctx.from.id;
  
  // Игнорируем команды
  if (question.startsWith('/')) return;
  
  // Проверяем, активирован ли режим AI
  const aiMode = userAiMode.get(userId);
  
  if (!aiMode) {
    // Режим не активирован — игнорируем или показываем подсказку
    return; // Тихо игнорируем
  }
  
  // Показываем, что бот печатает
  await ctx.sendChatAction('typing');
  
  try {
    const answer = await askExpert(question, aiMode);
    
    await ctx.reply(answer, {
      parse_mode: 'Markdown',
      ...MENU_BUTTON
    });
    
    // Сбрасываем режим после ответа
    userAiMode.delete(userId);
    
  } catch (error) {
    console.error('Ошибка обработки вопроса:', error);
    await ctx.reply('😔 Произошла ошибка. Попробуйте ещё раз.');
    userAiMode.delete(userId);
  }
});

// ============================================
// Запуск бота
// ============================================

async function main() {
  // Инициализация базы данных (асинхронная для sql.js)
  await initDatabase();
  
  // Graceful shutdown
  process.once('SIGINT', () => {
    import('./database.js').then(db => db.saveDatabase());
    bot.stop('SIGINT');
  });
  process.once('SIGTERM', () => {
    import('./database.js').then(db => db.saveDatabase());
    bot.stop('SIGTERM');
  });

  // Запуск планировщика
  scheduleMorningTip(bot);

  // Запуск бота
  await bot.launch();
  console.log('🐕 Samoyed Mentor Bot запущен!');
  console.log('Нажмите Ctrl+C для остановки');
}

main().catch((error) => {
  console.error('❌ Ошибка запуска бота:', error.message);
  process.exit(1);
});
