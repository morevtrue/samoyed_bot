# Архитектура проекта

## Принципы

### 1. Модульность
Каждый файл отвечает за одну область:
- `index.js` — логика бота и UI
- `database.js` — работа с данными
- `training.js` — контент (задания, база знаний)
- `deepseek.js` — AI-интеграция
- `scheduler.js` — планировщик задач

### 2. Разделение данных и логики
**Данные:** `training.js` содержит только массивы и объекты  
**Логика:** `index.js` использует данные, но не изменяет их

### 3. Stateless бот
Бот не хранит состояния между сообщениями.  
Вся логика работает через callback_query и прямые команды.

### 4. Простота > Сложность
- Нет middleware
- Нет абстракций "на вырост"
- Прямолинейный код
- Явное лучше неявного

## Структура файлов

### `index.js` — главный файл
**Отвечает за:**
- Инициализацию Telegraf
- Обработку команд (`/start`)
- Обработку кнопок (callback queries)
- Обработку текстовых сообщений (AI)
- Главное меню и навигацию

**Основные секции:**
```javascript
// Создание бота
const bot = new Telegraf(config.botToken);

// Обработка ошибок
bot.catch((err, ctx) => { ... });

// Главное меню
function getMainMenu() { ... }

// Команда /start
bot.start(async (ctx) => { ... });

// Обработчики главного меню
bot.action('menu_plan', ...);
bot.action('menu_tracker', ...);
bot.action('menu_knowledge', ...);
bot.action('menu_ai', ...);
bot.action('menu_sos', ...);

// Обработчики трекера
bot.action('track_feed', ...);
bot.action('track_walk_ok', ...);

// Обработчики базы знаний
bot.action(/^kb_cat_(.+)$/, ...);
bot.action(/^kb_item_(.+)_(\d+)$/, ...);

// Обработчики SOS
bot.action(/^sos_(.+)$/, ...);
bot.action('sos_custom', ...);

// Обработка текста (AI)
bot.on('text', async (ctx) => { ... });

// Запуск
async function main() { ... }
```

### `database.js` — работа с SQLite
**Отвечает за:**
- Инициализацию базы данных
- CRUD операции для:
  - Кормлений (`feedings`)
  - Прогулок (`walks`)
  - Прогресса команд (`command_progress`)
  - Подписок (`subscriptions`)

**Важно:**
- Использует `sql.js` (асинхронная работа)
- Сохраняет базу в файл после каждого изменения
- Экспортирует функции, а не класс

**API:**
```javascript
export async function initDatabase()
export function logFeeding(userId)
export function getLastFeeding(userId)
export function logWalk(userId, successful)
export function getWalkStats(userId, days = 7)
export function subscribeUser(userId)
export function getAllSubscribers()
export function updateCommandProgress(userId, commandName, progress)
export function getCommandProgress(userId, commandName)
```

### `training.js` — контент
**Содержит:**
- `DAILY_TASKS` — 30 заданий для тренировок
- `MORNING_TIP_TOPICS` — 16 тем для утренних советов
- `PANIC_ADVICE` — 9 SOS-категорий
- `KNOWLEDGE_BASE` — 8 категорий, 60+ статей

**Экспортирует функции:**
```javascript
export function getDailyPlan(count = 3)
export function getRandomTipTopic()
export function getPanicTopics()
export function getPanicAdvice(issue)
export function formatDailyPlan(tasks)
export const KNOWLEDGE_BASE
```

### `ai.js` (бывший `deepseek.js`)
- Клиент GitHub Models (OpenAI SDK)
- Системный промпт (самоед-эксперт)
- `generateMorningTip(topic)`
- Фолбек-механизм (статические советы при сбоях)

**API:**
```javascript
export async function askExpert(question)
export async function generateMorningTip(topic)
```

### `scheduler.js` — планировщик
**Отвечает за:**
- Запуск утренних советов в 9:00 МСК
- Генерацию совета через AI
- Рассылку подписчикам

**API:**
```javascript
export function scheduleMorningTip(bot)
export function cancelAllJobs()
```

### `config.js` — конфигурация
**Содержит:**
- `botToken` — из переменной окружения
- `githubToken` — для AI API
- `databasePath` — путь к БД
- `morningTipTime` — время рассылки

## Поток данных

### 1. Команда /start
```
Пользователь → /start
           ↓
    bot.start() в index.js
           ↓
    subscribeUser() в database.js
           ↓
    Отправка приветствия + главное меню
```

### 2. Получение плана
```
Пользователь → нажимает "План на сегодня"
           ↓
    bot.action('menu_plan') в index.js
           ↓
    getDailyPlan(3) в training.js
           ↓
    formatDailyPlan() в training.js
           ↓
    Отправка плана пользователю
```

### 3. Вопрос к AI
```
Пользователь → пишет текст
           ↓
    bot.on('text') в index.js
           ↓
    askExpert(question) в ai.js
           ↓
    gpt-4o-mini через GitHub Models
           ↓
    Ответ пользователю
```

### 4. Утренний совет
```
Таймер → 9:00 (cron)
       ↓
    scheduleMorningTip() в scheduler.js
       ↓
    getRandomTipTopic() в training.js
       ↓
    generateMorningTip(topic) в ai.js
       ↓
    getAllSubscribers() в database.js
       ↓
    Рассылка всем подписчикам
```

## База данных

### Схема таблиц

**feedings** — кормления
```sql
CREATE TABLE feedings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  fed_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**walks** — прогулки
```sql
CREATE TABLE walks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  walked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  successful BOOLEAN NOT NULL
)
```

**command_progress** — прогресс команд
```sql
CREATE TABLE command_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  command_name TEXT NOT NULL,
  progress INTEGER DEFAULT 0,
  last_practiced DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

**subscriptions** — подписки на уведомления
```sql
CREATE TABLE subscriptions (
  user_id INTEGER PRIMARY KEY,
  subscribed_at DATETIME DEFAULT CURRENT_TIMESTAMP
)
```

## Расширяемость

### Добавление новой кнопки в главное меню
1. Добавить кнопку в `getMainMenu()` в `index.js`
2. Создать обработчик `bot.action('menu_xxx', ...)` в `index.js`
3. При необходимости — добавить данные в `training.js`

### Добавление новой категории в базу знаний
1. Добавить категорию в `KNOWLEDGE_BASE` в `training.js`
2. Логика в `index.js` автоматически подхватит

### Добавление новой SOS-категории
1. Добавить в `PANIC_ADVICE` в `training.js`
2. Логика в `index.js` автоматически подхватит

## Ограничения архитектуры

### Текущие
- **Один процесс** — нет горизонтального масштабирования
- **sql.js в памяти** — не подходит для highload
- **Нет очередей** — все запросы обрабатываются последовательно
- **Нет кеша** — каждый запрос к AI идёт в API

### Когда менять
- \>1000 пользователей → PostgreSQL + Redis
- \>100 запросов/мин к AI → очередь (Bull)
- Несколько инстансов → сессии в Redis
- Критичность → PM2 + мониторинг
