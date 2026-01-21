// ============================================
// Новые функции для расширенного функционала
// ============================================

import { logger } from './logger.js';
import db, { scheduleSave, updateCommandProgress } from './database.js';

/**
 * Сохранить фото в дневник
 */
export function savePhoto(userId, fileId, caption = '') {
  db.run(
    'INSERT INTO photos (user_id, file_id, caption, timestamp) VALUES (?, ?, ?, ?)',
    [String(userId), fileId, caption, Date.now()]
  );
  scheduleSave();
  logger.info('Photo saved to diary', { userId });
}

/**
 * Получить фото пользователя
 */
export function getPhotos(userId, limit = 10) {
  const results = [];
  const stmt = db.prepare('SELECT * FROM photos WHERE user_id = ? ORDER BY timestamp DESC LIMIT ?');
  stmt.bind([String(userId), limit]);
  while (stmt.step()) {
    const row = stmt.getAsObject();
    results.push(row);
  }
  stmt.free();
  return results;
}

/**
 * Обновить прогресс по команде (для трекера команд)
 */
export function incrementCommandProgress(userId, commandName) {
  // Получаем текущий прогресс
  const stmt = db.prepare('SELECT score FROM command_progress WHERE user_id = ? AND command = ?');
  stmt.bind([String(userId), commandName]);
  
  let currentScore = 0;
  if (stmt.step()) {
    currentScore = stmt.getAsObject().score || 0;
  }
  stmt.free();
  
  // Увеличиваем на 1
  updateCommandProgress(userId, commandName, currentScore + 1 - currentScore); // delta = 1
  
  logger.info('Command progress incremented', { userId, command: commandName });
  return currentScore + 1;
}
