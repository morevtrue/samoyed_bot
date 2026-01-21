import { Markup } from 'telegraf';
import { 
  addScheduleItem, 
  getSchedule, 
  deleteScheduleItem 
} from '../database.js';
import { rescheduleUserEvents } from '../scheduler.js';

export function initScheduleHandlers(bot, userScheduleParams) {
  
  // Меню режима дня
  bot.action('menu_schedule', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    await showScheduleMenu(ctx, userId);
  });

  async function showScheduleMenu(ctx, userId) {
    const schedule = getSchedule(userId);
    const isMessage = !!ctx.message;
    const method = isMessage ? 'reply' : 'editMessageText';
    
    let text = '⏰ *Режим дня и напоминания*\n\n';
    
    if (schedule.length === 0) {
      text += 'Список пуст. Добавьте события, чтобы получать напоминания за 10 минут.\n';
    } else {
      schedule.forEach(item => {
        text += `• ${item.event_time} — ${item.event_type}\n`;
      });
    }
    
    text += '\n_Я буду напоминать о событиях за 10 минут._';

    await ctx[method](text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('➕ Добавить событие', 'schedule_add')],
        [Markup.button.callback('🗑️ Удалить событие', 'schedule_delete')],
        [Markup.button.callback('« Главное меню', 'menu_main')]
      ])
    });
  }

  // Добавление события
  bot.action('schedule_add', async (ctx) => {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText('Выберите тип события:', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🍖 Кормление', 'sch_type_feeding')],
        [Markup.button.callback('🚶 Прогулка', 'sch_type_walk')],
        [Markup.button.callback('🎓 Тренировка', 'sch_type_training')],
        [Markup.button.callback('😴 Сон', 'sch_type_sleep')],
        [Markup.button.callback('« Отмена', 'menu_schedule')]
      ])
    });
  });

  // Выбор типа события
  bot.action(/^sch_type_(.+)$/, async (ctx) => {
    await ctx.answerCbQuery();
    const typeKey = ctx.match[1];
    const typeMap = {
      feeding: '🍖 Кормление',
      walk: '🚶 Прогулка',
      training: '🎓 Тренировка',
      sleep: '😴 Сон'
    };
    
    userScheduleParams.set(ctx.from.id, { type: typeMap[typeKey] });
    
    await ctx.editMessageText(`⏰ Введите время для события "${typeMap[typeKey]}" в формате ЧЧ:ММ (например 08:30):`, {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Отмена', 'menu_schedule')]
      ])
    });
  });

  // Удаление события
  bot.action('schedule_delete', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const schedule = getSchedule(userId);
    
    if (schedule.length === 0) {
      return ctx.editMessageText('Список пуст, удалять нечего.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'menu_schedule')]])
      });
    }
    
    const buttons = schedule.map(item => [
      Markup.button.callback(`❌ ${item.event_time} ${item.event_type}`, `sch_del_${item.id}`)
    ]);
    buttons.push([Markup.button.callback('« Назад', 'menu_schedule')]);
    
    await ctx.editMessageText('Выберите событие для удаления:', {
      ...Markup.inlineKeyboard(buttons)
    });
  });

  // Обработка удаления
  bot.action(/^sch_del_(.+)$/, async (ctx) => {
    const id = ctx.match[1];
    deleteScheduleItem(id);
    rescheduleUserEvents(bot, ctx.from.id);
    await ctx.answerCbQuery('🗑️ Удалено');
    showScheduleMenu(ctx, ctx.from.id);
  });
  
  // Экспортируем функцию показа меню, чтобы использовать ее в index.js после добавления времени
  return { showScheduleMenu };
}
