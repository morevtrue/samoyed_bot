// Модуль работы с базой данных SQLite (sql.js — без нативной компиляции)
import initSqlJs from 'sql.js';
import { config } from '../config.js';
import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

let db = null;

/**
 * Инициализация базы данных
 */
export async function initDatabase() {
  // Создаём директорию для БД, если не существует
  const dbDir = dirname(config.databasePath);
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  const SQL = await initSqlJs();
  
  // Загружаем существующую БД или создаём новую
  if (existsSync(config.databasePath)) {
    const buffer = readFileSync(config.databasePath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // Создание таблиц
  db.run(`
    CREATE TABLE IF NOT EXISTS feedings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      fed_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS walks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      success INTEGER NOT NULL,
      walked_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS command_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      command TEXT NOT NULL,
      score INTEGER DEFAULT 0,
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE(user_id, command)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS subscribers (
      user_id TEXT PRIMARY KEY,
      subscribed_at TEXT DEFAULT (datetime('now')),
      puppy_name TEXT
    )
  `);
  
  // Миграция: добавляем колонку puppy_name, если её нет (для старых БД)
  try {
    db.run('ALTER TABLE subscribers ADD COLUMN puppy_name TEXT');
  } catch (e) {
    // Игнорируем ошибку, если колонка уже есть
  }
  
  // Таблицы для новых фич
  
  db.run(`
    CREATE TABLE IF NOT EXISTS vaccinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      puppy_birth_date INTEGER,
      vaccination_type TEXT,
      scheduled_date INTEGER,
      completed_date INTEGER,
      is_completed INTEGER DEFAULT 0
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS weight_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      weight REAL NOT NULL,
      age_weeks INTEGER,
      timestamp INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS photos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      file_id TEXT NOT NULL,
      caption TEXT,
      timestamp INTEGER NOT NULL
    )
  `);
  
  db.run(`
    CREATE TABLE IF NOT EXISTS daily_schedule (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_time TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL
    )
  `);

  saveDatabase();
  console.log('✅ База данных инициализирована');
}

/**
 * Сохранить БД на диск
 */
// Таймер для отложенного сохранения
let saveTimeout = null;

/**
 * Сохранить БД на диск (немедленно)
 */
export function saveDatabase() {
  if (saveTimeout) {
    clearTimeout(saveTimeout);
    saveTimeout = null;
  }
  const data = db.export();
  const buffer = Buffer.from(data);
  writeFileSync(config.databasePath, buffer);
  // console.log('💾 БД сохранена на диск');
}

/**
 * Отложенное сохранение БД (debounce)
 * Сохраняет не чаще чем раз в 5 секунд, чтобы не убивать диск
 */
function scheduleSave() {
  if (saveTimeout) return; // Уже запланировано
  
  saveTimeout = setTimeout(() => {
    saveDatabase();
  }, 5000);
}

// ... остальной код будет использовать scheduleSave вместо saveDatabase


/**
 * Записать время кормления
 */
export function logFeeding(userId) {
  db.run('INSERT INTO feedings (user_id) VALUES (?)', [String(userId)]);
  scheduleSave();
}

/**
 * Получить последнее кормление
 */
export function getLastFeeding(userId) {
  const stmt = db.prepare('SELECT fed_at FROM feedings WHERE user_id = ? ORDER BY fed_at DESC LIMIT 1');
  stmt.bind([String(userId)]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return null;
}

/**
 * Получить статистику кормлений за последние N дней
 */
export function getFeedingStats(userId, days = 7) {
  const results = [];
  const stmt = db.prepare(`
    SELECT DATE(fed_at) as date, COUNT(*) as count 
    FROM feedings 
    WHERE user_id = ? AND fed_at >= datetime('now', '-' || ? || ' days')
    GROUP BY DATE(fed_at)
    ORDER BY date DESC
  `);
  stmt.bind([String(userId), days]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Записать прогулку
 */
export function logWalk(userId, success) {
  db.run('INSERT INTO walks (user_id, success) VALUES (?, ?)', [String(userId), success ? 1 : 0]);
  scheduleSave();
}

/**
 * Получить статистику прогулок за последние N дней
 */
export function getWalkStats(userId, days = 7) {
  const stmt = db.prepare(`
    SELECT 
      COUNT(*) as total,
      SUM(success) as successful
    FROM walks 
    WHERE user_id = ? AND walked_at >= datetime('now', 'start of day', '-' || ? || ' days')
    `);
  stmt.bind([String(userId), days]);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row;
  }
  stmt.free();
  return { total: 0, successful: 0 };
}

/**
 * Обновить прогресс по команде
 */
export function updateCommandProgress(userId, command, delta = 1) {
  // Пробуем обновить существующую запись
  db.run(`
    INSERT INTO command_progress (user_id, command, score, updated_at) 
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(user_id, command) 
    DO UPDATE SET score = score + excluded.score, updated_at = datetime('now')
  `, [String(userId), command, delta]);
  scheduleSave();
}

/**
 * Получить прогресс по всем командам
 */
export function getCommandProgress(userId) {
  const results = [];
  const stmt = db.prepare('SELECT command, score FROM command_progress WHERE user_id = ? ORDER BY score DESC');
  stmt.bind([String(userId)]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Подписать пользователя на уведомления
 */
export function subscribeUser(userId) {
  db.run('INSERT OR IGNORE INTO subscribers (user_id) VALUES (?)', [String(userId)]);
  scheduleSave();
}

/**
 * Установить имя щенка
 */
export function setPuppyName(userId, name) {
  db.run('UPDATE subscribers SET puppy_name = ? WHERE user_id = ?', [name, String(userId)]);
  // Если пользователя еще нет, создаем
  db.run('INSERT OR IGNORE INTO subscribers (user_id, puppy_name) VALUES (?, ?)', [String(userId), name]);
  scheduleSave();
}

/**
 * Получить имя щенка
 */
export function getPuppyName(userId) {
  const stmt = db.prepare('SELECT puppy_name FROM subscribers WHERE user_id = ? LIMIT 1');
  stmt.bind([String(userId)]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject().puppy_name;
  }
  stmt.free();
  return result;
}

/**
 * Отписать пользователя от уведомлений
 */
export function unsubscribeUser(userId) {
  db.run('DELETE FROM subscribers WHERE user_id = ?', [String(userId)]);
  scheduleSave();
}

/**
 * Полный сброс данных пользователя
 */
export function resetUserData(userId) {
  const tables = [
    'subscribers', 'feedings', 'walks', 'weight_logs', 
    'vaccinations', 'daily_schedule', 'command_progress', 'photos'
  ];
  
  const id = String(userId);
  
  db.exec('BEGIN TRANSACTION');
  try {
    tables.forEach(table => {
      // daily_schedule имеет структуру без user_id? Нет, там есть user_id.
      // Проверяем наличие user_id в таблицах.
      // В initDatabase мы видим создание таблиц, везде есть user_id.
      db.run(`DELETE FROM ${table} WHERE user_id = ?`, [id]);
    });
    db.exec('COMMIT');
    scheduleSave();
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Error resetting user data:', error);
    throw error;
  }
}

/**
 * Получить всех подписчиков
 */
export function getAllSubscribers() {
  const results = [];
  const stmt = db.prepare('SELECT user_id FROM subscribers');
  while (stmt.step()) {
    results.push(stmt.getAsObject().user_id);
  }
  stmt.free();
  return results;
}

// ============================================
// Прививки и ветеринария
// ============================================

/**
 * Установить дату рождения щенка и создать график прививок
 */
export function setPuppyBirthDate(userId, birthTimestamp) {
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  const MONTH = 30 * 24 * 60 * 60 * 1000;
  
  // Стандартный график прививок для щенков
  const schedule = [
    { type: 'Первая прививка (DHPP)', offset: 8 * WEEK, description: 'Чумка, Гепатит, Парвовирус, Парагрипп' },
    { type: 'Вторая прививка (DHPP)', offset: 12 * WEEK, description: 'Ревакцинация DHPP' },
    { type: 'Третья прививка + Бешенство', offset: 16 * WEEK, description: 'DHPP + Бешенство (Rabies)' },
    { type: 'Дегельминтизация (1)', offset: 7 * WEEK, description: 'За неделю до первой прививки' },
    { type: 'Дегельминтизация (2)', offset: 11 * WEEK, description: 'За неделю до второй прививки' },
    { type: 'Дегельминтизация (3)', offset: 15 * WEEK, description: 'За неделю до третьей прививки' },
    { type: 'Ежегодная ревакцинация', offset: 12 * MONTH, description: 'Комплексная + Бешенство' }
  ];

  // Очищаем старый график для пользователя
  db.run('DELETE FROM vaccinations WHERE user_id = ?', [String(userId)]);

  // Создаем новые записи
  const stmt = db.prepare('INSERT INTO vaccinations (user_id, puppy_birth_date, vaccination_type, scheduled_date) VALUES (?, ?, ?, ?)');
  
  db.exec('BEGIN TRANSACTION');
  try {
    schedule.forEach(item => {
      const date = birthTimestamp + item.offset;
      stmt.run([String(userId), birthTimestamp, item.type, date]);
    });
    db.exec('COMMIT');
    scheduleSave();
  } catch (error) {
    db.exec('ROLLBACK');
    console.error('Error creating vaccination schedule:', error);
    throw error;
  } finally {
    stmt.free();
  }
}

/**
 * Получить график прививок пользователя
 */
export function getVaccinationSchedule(userId) {
  const results = [];
  const stmt = db.prepare('SELECT * FROM vaccinations WHERE user_id = ? ORDER BY scheduled_date');
  stmt.bind([String(userId)]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Получить ближайшие прививки (которые еще не сделаны)
 */
export function getUpcomingVaccinations(userId, limit = 3) {
  const results = [];
  // Берем прививки, которые еще не сделаны (is_completed = 0)
  const stmt = db.prepare('SELECT * FROM vaccinations WHERE user_id = ? AND is_completed = 0 ORDER BY scheduled_date LIMIT ?');
  stmt.bind([String(userId), limit]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Отметить прививку как сделанную
 */
export function markVaccinationDone(id) {
  db.run('UPDATE vaccinations SET is_completed = 1, completed_date = ? WHERE id = ?', [Date.now(), id]);
  scheduleSave();
}

// ============================================
// Трекер веса
// ============================================

/**
 * Записать вес щенка
 */
export function logWeight(userId, weight, ageWeeks) {
  db.run(
    'INSERT INTO weight_logs (user_id, weight, age_weeks, timestamp) VALUES (?, ?, ?, ?)',
    [String(userId), weight, ageWeeks, Date.now()]
  );
  scheduleSave();
}

/**
 * Получить историю веса
 */
export function getWeightHistory(userId, limit = 10) {
  const results = [];
  const stmt = db.prepare('SELECT * FROM weight_logs WHERE user_id = ? ORDER BY timestamp ASC'); // ASC для графика
  stmt.bind([String(userId)]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  // Если лимит нужен, берем последние N
  if (limit && results.length > limit) {
    return results.slice(results.length - limit);
  }
  return results;
}

/**
 * Получить последнюю запись веса
 */
export function getLastWeight(userId) {
  const stmt = db.prepare('SELECT * FROM weight_logs WHERE user_id = ? ORDER BY timestamp DESC LIMIT 1');
  stmt.bind([String(userId)]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject();
  }
  stmt.free();
  return result;
}

/**
 * Получить дату рождения щенка (из таблицы вакцинации)
 */
export function getPuppyBirthDate(userId) {
  const stmt = db.prepare('SELECT puppy_birth_date FROM vaccinations WHERE user_id = ? LIMIT 1');
  stmt.bind([String(userId)]);
  let result = null;
  if (stmt.step()) {
    result = stmt.getAsObject().puppy_birth_date;
  }
  stmt.free();
  return result;
}

// Экспорт db как default
export default db;

// ============================================
// Режим дня
// ============================================

export function addScheduleItem(userId, type, time) {
  db.run(
    'INSERT INTO daily_schedule (user_id, event_type, event_time, created_at) VALUES (?, ?, ?, ?)',
    [userId, type, time, Date.now()]
  );
}

export function getSchedule(userId) {
  const results = [];
  const stmt = db.prepare('SELECT * FROM daily_schedule WHERE user_id = ? AND is_active = 1 ORDER BY event_time');
  stmt.bind([String(userId)]);
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

export function deleteScheduleItem(id) {
  db.run('DELETE FROM daily_schedule WHERE id = ?', [id]);
}

export function getAllSchedules() {
  const results = [];
  const stmt = db.prepare('SELECT * FROM daily_schedule WHERE is_active = 1');
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

/**
 * Очистить ВСЕ данные (для сброса)
 */
export function clearAllData() {
  const tables = [
    'subscribers', 'feedings', 'walks', 'command_progress', 
    'vaccinations', 'weight_logs', 'photos', 'daily_schedule'
  ];
  
  tables.forEach(table => {
    try {
      db.run(`DELETE FROM ${table}`);
    } catch (e) {
      console.error(`Error clearing ${table}:`, e.message);
    }
  });
  
  scheduleSave();
}
