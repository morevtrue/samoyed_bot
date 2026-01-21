import { Markup } from 'telegraf';
import { 
  getLastFeeding, 
  logFeeding, 
  getLastWeight, 
  getPuppyBirthDate 
} from '../database.js';
import { 
  calculateFoodPortion, 
  calculateDryFoodPortion 
} from '../food-utils.js';

export function initFeedingHandlers(bot) {
  
  // Меню Питания
  bot.action('menu_feeding', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const lastFeeding = getLastFeeding(userId);
    
    let feedingInfo = 'Пока не кормили сегодня';
    if (lastFeeding) {
      const date = new Date(lastFeeding.fed_at + 'Z');
      const timeStr = date.toLocaleString('ru-RU', { 
        timeZone: 'Europe/Moscow',
        hour: '2-digit', 
        minute: '2-digit'
      });
      feedingInfo = `Последний раз: сегодня в ${timeStr}`;
    }

    const text = `🦴 *Питание щенка*\n\n${feedingInfo}\n\nЧто сделаем?`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🍽️ Дали покушать', 'track_feed')],
        [Markup.button.callback('🧮 Калькулятор корма', 'calc_food_start')],
        [Markup.button.callback('« Главное меню', 'menu_main')]
      ])
    });
  });

  // Запись кормления
  bot.action('track_feed', async (ctx) => {
    const userId = ctx.from.id;
    logFeeding(userId);
    await ctx.answerCbQuery('🍽️ Кормление записано!');
    // Перерисовываем трекер
    ctx.match = null; // сброс для повторного вызова
    await bot.handleUpdate({ callback_query: { ...ctx.callbackQuery, data: 'menu_feeding' } });
  });

  // Калькулятор корма - старт
  bot.action('calc_food_start', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    
    // Пытаемся получить данные из БД
    const lastWeight = getLastWeight(userId);
    const birthDate = getPuppyBirthDate(userId);
    
    if (!lastWeight || !birthDate) {
      let msg = '⚠️ *Недостаточно данных для расчета*\n\n';
      
      msg += birthDate ? '✅ Возраст: известен\n' : '❌ Возраст: не указан (нужна дата рождения)\n';
      msg += lastWeight ? `✅ Вес: ${lastWeight.weight} кг\n` : '❌ Вес: не указан\n';
      
      msg += '\nПожалуйста, заполните недостающие данные:';

      return ctx.editMessageText(msg, {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          !birthDate ? [Markup.button.callback('💉 Указать дату рождения', 'vacc_reset_date')] : [],
          !lastWeight ? [Markup.button.callback('⚖️ Указать вес', 'menu_weight')] : [],
          [Markup.button.callback('« Назад', 'menu_feeding')]
        ].filter(row => row.length > 0))
      });
    }

    await ctx.editMessageText('🍽️ *Какой тип питания вы используете?*', {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('🥩 Натуралка / BARF', 'calc_food_natural')],
        [Markup.button.callback('🦴 Сухой корм', 'calc_food_dry')],
        [Markup.button.callback('« Назад', 'menu_feeding')]
      ])
    });
  });
  
  // Калькулятор - Натуралка
  bot.action('calc_food_natural', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const lastWeight = getLastWeight(userId);
    
    const result = calculateFoodPortion(lastWeight.age_weeks, lastWeight.weight);
    
    const text = `🧮 *Калькулятор: Натуралка (BARF)*
    
  ⚖️ Вес щенка: ${lastWeight.weight} кг
  📅 Возраст: ${lastWeight.age_weeks} недель
  📊 Процент от веса: ${result.percentage}%
  
  🍖 *Суточная норма:* ~${result.dailyTotal} г
  🥣 *Разовая порция:* ~${result.perMeal} г
  🕒 *Кормлений в день:* ${result.meals}
  
  _⚠️ Расчет приблизительный. Следите за кондицией щенка!_`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚖️ Обновить вес', 'weight_add')],
        [Markup.button.callback('🦴 Посчитать сухой корм', 'calc_food_dry')],
        [Markup.button.callback('« Назад', 'menu_feeding')]
      ])
    });
  });

  // Калькулятор - Сухой корм
  bot.action('calc_food_dry', async (ctx) => {
    await ctx.answerCbQuery();
    const userId = ctx.from.id;
    const lastWeight = getLastWeight(userId);
    
    const result = calculateDryFoodPortion(lastWeight.age_weeks, lastWeight.weight);
    
    const text = `🧮 *Калькулятор: Сухой корм*
    
  ⚖️ Вес щенка: ${lastWeight.weight} кг
  📅 Возраст: ${lastWeight.age_weeks} недель
  🔥 Потребность в энергии: ~${result.dailyKcal} ккал
  
  🦴 *Суточная норма:* ~${result.dailyTotal} г
  🥣 *Разовая порция:* ~${result.perMeal} г
  🕒 *Кормлений в день:* ${result.meals}
  
  _⚠️ Рассчитано для корма 3800 ккал/кг. Проверьте упаковку вашего корма!_`;

    await ctx.editMessageText(text, {
      parse_mode: 'Markdown',
      ...Markup.inlineKeyboard([
        [Markup.button.callback('⚖️ Обновить вес', 'weight_add')],
        [Markup.button.callback('🥩 Посчитать натуралку', 'calc_food_natural')],
        [Markup.button.callback('« Назад', 'menu_feeding')]
      ])
    });
  });
}
