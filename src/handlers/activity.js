import { Markup } from 'telegraf';
import { 
  getWalkStats, 
  logWalk 
} from '../database.js';
import { 
  getDailyPlan, 
  formatDailyPlan 
} from '../training.js';

export function initActivityHandlers(bot) {
  
  // Меню Прогулок
  bot.action('menu_walks', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const walkStats = getWalkStats(userId, 0); 
    
    const reliableWalks = walkStats?.successful || 0;
    const accidents = walkStats?.total ? (walkStats.total - reliableWalks) : 0;

    const text = `🌳 *Прогулки и туалет*\n\nСегодня:\n✅ На улице: ${reliableWalks}\n💦 Дома: ${accidents}\n\n👇 *Добавить запись:*`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('✅ Сходил на улице', 'track_walk_ok')],
        [Markup.button.callback('💦 Промах дома', 'track_walk_fail')],
        [Markup.button.callback('« Главное меню', 'menu_main')]
      ])
    });
  });

  // Трекер прогулок - Успех
  bot.action('track_walk_ok', async (ctx) => {
    const userId = ctx.from.id;
    logWalk(userId, true);
    await ctx.answerCbQuery('✅ Успешная прогулка записана! Молодец!');
    await bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'menu_walks' } });
  });

  // Трекер прогулок - Промах
  bot.action('track_walk_fail', async (ctx) => {
    const userId = ctx.from.id;
    logWalk(userId, false);
    await ctx.answerCbQuery('❌ Записано. Не расстраивайся, в следующий раз получится!');
    await bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'menu_walks' } });
  });
  


  // План тренировок
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
}
