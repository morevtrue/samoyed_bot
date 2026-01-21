import { Markup } from 'telegraf';
import { 
  getVaccinationSchedule, 
  getUpcomingVaccinations, 
  getLastWeight, 
  getPuppyBirthDate, 
  getWeightHistory 
} from '../database.js';
// Переменные userBirthDateParams и userWeightParams находятся в closures index.js
// Мы не можем легко их шарить без глобального store или middleware.
// Решение: Передадим Map'ы в init-функцию или будем использовать session (но у нас нет session middleware).
// Проще всего: Оставить логику установки параметров (bot.action) здесь, но сами мапы должны быть доступны.
// В данном случае, handlers меняют состояние (set), а index.js читает (get) в on('text').
// Мы можем передать эти Map'ы как аргументы в initHealthHandlers.

import { getWeightNorm, generateWeightGraph } from '../weight-utils.js';

export function initHealthHandlers(bot, userBirthDateParams, userWeightParams) {
  
  // ============================================
  // Прививки
  // ============================================

  bot.action('menu_vaccinations', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    await showVaccinationMenu(ctx, userId, userBirthDateParams);
  });

  async function showVaccinationMenu(ctx, userId, birthDateParams) {
    const schedule = getVaccinationSchedule(userId);
    const isMessage = !!ctx.message;
    const method = isMessage ? 'reply' : 'editMessageText';
    
    // Если графика нет -> просим ввести дату
    if (schedule.length === 0) {
      birthDateParams.set(userId, true);
      return ctx[method](
        '💉 *Календарь прививок*\n\nЧтобы я мог рассчитать персональный график прививок, мне нужно знать дату рождения вашего щенка.\n\n👇 Напишите дату в формате ДД.ММ.ГГГГ (например, 15.03.2025):',
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('« Главное меню', 'menu_main')]
          ])
        }
      );
    }

    // Если график есть -> показываем
    const upcoming = getUpcomingVaccinations(userId, 3);
    let text = '💉 *Ваш календарь прививок*\n\n';
    
    if (upcoming.length > 0) {
      text += '*Ближайшие процедуры:*\n';
      upcoming.forEach(v => {
        const date = new Date(v.scheduled_date).toLocaleDateString('ru-RU');
        text += `📅 ${date} — ${v.vaccination_type}\n`;
      });
    } else {
      text += '✅ Все основные прививки сделаны!\n';
    }
    
    text += '\n_Вы всегда можете посмотреть полный список или изменить дату рождения._';

    await ctx[method](text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('📋 Полный график', 'vacc_full_schedule')],
        [Markup.button.callback('✏️ Изменить дату', 'vacc_reset_date')],
        [Markup.button.callback('« Главное меню', 'menu_main')]
      ])
    });
  }

  bot.action('vacc_full_schedule', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const schedule = getVaccinationSchedule(userId);
    
    let text = '📋 *Полный график прививок*\n\n';
    schedule.forEach(v => {
      const date = new Date(v.scheduled_date).toLocaleDateString('ru-RU');
      const status = v.is_completed ? '✅' : '⏳';
      text += `${status} *${date}* — ${v.vaccination_type}\n`;
    });
    
    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Назад', 'menu_vaccinations')]
      ])
    });
  });

  bot.action('vacc_reset_date', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    
    userBirthDateParams.set(userId, true);
    await ctx.editMessageText(
      '✏️ *Изменение даты рождения*\n\nВведите новую дату рождения щенка (ДД.ММ.ГГГГ):',
      {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('« Отмена', 'menu_vaccinations')]
        ])
      }
    );
  });

  // ============================================
  // Трекер веса
  // ============================================

  bot.action('menu_weight', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    await showWeightMenu(ctx, userId);
  });

  async function showWeightMenu(ctx, userId) {
    const lastWeight = getLastWeight(userId);
    const birthDate = getPuppyBirthDate(userId);
    const isMessage = !!ctx.message;
    const method = isMessage ? 'reply' : 'editMessageText';
    
    let text = '⚖️ *Трекер веса щенка*\n\n';
    
    if (lastWeight) {
      const norm = getWeightNorm(lastWeight.age_weeks);
      let statusText = '';
      if (norm) {
        if (lastWeight.weight < norm.min) statusText = ' (📉 Ниже нормы)';
        else if (lastWeight.weight > norm.max) statusText = ' (⚠️ Выше нормы)';
        else statusText = ' (✅ В норме)';
      }
      
      text += `Последнее взвешивание:\n`;
      text += `⚖️ *${lastWeight.weight} кг* (${lastWeight.age_weeks} недель)\n`;
      text += `📅 ${new Date(lastWeight.timestamp).toLocaleDateString()}${statusText}\n\n`;
      
      if (norm) {
        text += `💡 Норма для ${lastWeight.age_weeks} недель: ${norm.min}-${norm.max} кг\n\n`;
      }
    } else {
      text += 'Пока нет записей о весе. Давайте добавим первое взвешивание!\n\n';
    }
    
    if (!birthDate) {
      text += '⚠️ *Важно:* Для точного расчета возраста укажите дату рождения.\n\n';
    }

    const buttons = [
      [Markup.button.callback('➕ Добавить вес', 'weight_add')],
      [Markup.button.callback('📈 История и график', 'weight_history')]
    ];

    if (!birthDate) {
      buttons.push([Markup.button.callback('📅 Указать дату рождения', 'vacc_reset_date')]);
    }

    buttons.push([Markup.button.callback('« Главное меню', 'menu_main')]);

    await ctx[method](text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard(buttons)
    });
  }

  bot.action('weight_add', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    
    userWeightParams.set(userId, true); // Включаем режим ожидания ввода
    
    await ctx.editMessageText('⚖️ Введите текущий вес щенка в кг (например: 12.5):', {
      ...Markup.inlineKeyboard([
        [Markup.button.callback('« Отмена', 'menu_weight')]
      ])
    });
  });

  bot.action('weight_history', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const history = getWeightHistory(userId);
    
    if (history.length === 0) {
      return ctx.editMessageText('📉 История пуста.', {
        ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'menu_weight')]])
      });
    }
    
    const graph = generateWeightGraph(history);
    
    await ctx.editMessageText(graph, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([[Markup.button.callback('« Назад', 'menu_weight')]])
    });
  });
  
  return { showVaccinationMenu, showWeightMenu };
}
