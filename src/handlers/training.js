import { Markup } from 'telegraf';
import { 
  getCommandProgress, 
  updateCommandProgress 
} from '../database.js';
import { 
  getDailyPlan, 
  formatDailyPlan,
  COMMANDS 
} from '../training.js';

export function initTrainingHandlers(bot) {
  
  // Меню тренировок
  bot.action('menu_training', async (ctx) => {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText('🎓 *Тренировки*\n\nВыберите раздел:', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📅 План на сегодня', 'menu_plan')],
        [Markup.button.callback('📊 Мой прогресс', 'menu_progress')],
        [Markup.button.callback('📚 База знаний', 'menu_knowledge')],
        [Markup.button.callback('« Главное меню', 'menu_main')]
      ])
    });
  });

  // План тренировок (дублируется в activity.js, но здесь он часть подменю)
  // Лучше оставить обработчик в activity.js, так как он там уже есть.
  // Но кнопки ссылаются на него.

  // Просмотр прогресса
  bot.action('menu_progress', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const progressList = getCommandProgress(userId);
    
    // Создаем карту прогресса для быстрого доступа
    const progressMap = new Map();
    progressList.forEach(p => progressMap.set(p.command, p.score));
    
    let text = '📊 *Прогресс обучения*\n\n';
    
    // Группируем команды по категориям
    const categories = {
      basic: '🟢 Базовые',
      advanced: '🟡 Продвинутые',
      discipline: '🔴 Дисциплина'
    };
    
    // Перебираем определенные нами команды и рендерим бар
    for (const [catKey, catName] of Object.entries(categories)) {
      const catCommands = COMMANDS.filter(c => c.category === catKey);
      
      if (catCommands.length > 0) {
        text += `*${catName}:*\n`;
        
        catCommands.forEach(cmd => {
          const score = progressMap.get(cmd.id) || 0;
          const target = cmd.target;
          const percent = Math.min(100, Math.round((score / target) * 100));
          
          // Рисуем бар: 10 символов
          const filled = Math.round(percent / 10);
          const empty = 10 - filled;
          const bar = '█'.repeat(filled) + '░'.repeat(empty);
          
          text += `${cmd.name}: \`${bar}\` ${score}/${target}\n`;
        });
        text += '\n';
      }
    }
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📝 Отметить тренировку', 'track_progress_select')],
        [Markup.button.callback('« Назад', 'menu_training')]
      ])
    });
  });

  // Выбор команды для отметки
  bot.action('track_progress_select', async (ctx) => {
    await ctx.answerCbQuery();
    
    const buttons = COMMANDS.map(cmd => {
      return [Markup.button.callback(cmd.name, `track_cmd_${cmd.id}`)];
    });
    
    buttons.push([Markup.button.callback('« Назад', 'menu_progress')]);
    
    await ctx.editMessageText('📝 *Выберите команду, которую тренировали:*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  });

  // Обработка клика по команде (инкремент)
  bot.action(/^track_cmd_(.+)$/, async (ctx) => {
    const commandId = ctx.match[1];
    const userId = ctx.from.id;
    const command = COMMANDS.find(c => c.id === commandId);
    
    if (!command) return ctx.answerCbQuery('Ошибка: команда не найдена');
    
    // +1 к прогрессу
    updateCommandProgress(userId, commandId, 1);
    
    await ctx.answerCbQuery(`✅ Супер! +1 к навыку "${command.name}"`);
    
    // Возвращаем в меню прогресса (перерисовываем)
    ctx.match = null; // Сброс match для корректной маршрутизации
    await bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'menu_progress' } });
  });
}
