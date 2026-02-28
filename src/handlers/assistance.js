import { Markup } from 'telegraf';
import { 
  getPanicTopics, 
  getPanicAdvice, 
  KNOWLEDGE_BASE 
} from '../training.js';

export function initAssistanceHandlers(bot, userAiMode) {
  
  const BACK_BUTTON = [Markup.button.callback('« Главное меню', 'menu_main')];

  // ============================================
  // База знаний
  // ============================================
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

  bot.action('menu_knowledge', async (ctx) => {
    await ctx.answerCbQuery();
    
    await ctx.editMessageText('📚 *База знаний*\n\nВыберите категорию:', {
      parse_mode: 'Markdown',
      ...createKnowledgeMenu()
    });
  });

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
  // SOS — экстренная помощь
  // ============================================
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
}
