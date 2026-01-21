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
      subscribed_at TEXT DEFAULT (datetime('now'))
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
 * Отписать пользователя от уведомлений
 */
export function unsubscribeUser(userId) {
  db.run('DELETE FROM subscribers WHERE user_id = ?', [String(userId)]);
  scheduleSave();
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

export default db;
