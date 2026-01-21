
/**
 * Нормы веса самоедов (в кг) по неделям
 * Источник: усредненные данные кинологов
 */
export const SAMOYED_WEIGHT_NORMS = {
  8: { min: 5.0, max: 7.5 },   // 2 месяца
  12: { min: 8.0, max: 12.0 }, // 3 месяца
  16: { min: 11.0, max: 16.0 }, // 4 месяца
  20: { min: 14.0, max: 19.0 },
  24: { min: 16.0, max: 22.0 }, // 6 месяцев
  32: { min: 19.0, max: 25.0 }, // 8 месяцев
  52: { min: 20.0, max: 30.0 }  // 1 год (взрослый)
};

/**
 * Получить норму для конкретного возраста
 */
export function getWeightNorm(ageWeeks) {
  // Находим ближайший ключ (неделю), который меньше или равен текущему возрасту
  const weeks = Object.keys(SAMOYED_WEIGHT_NORMS).map(Number).sort((a, b) => a - b);
  let norm = null;
  
  for (const w of weeks) {
    if (ageWeeks >= w) {
      norm = SAMOYED_WEIGHT_NORMS[w];
    } else {
      break; 
    }
  }
  
  // Если возраст меньше самой первой нормы (8 недель), берем ее или экстраполируем (пока просто вернем норму 8 недель)
  if (!norm && ageWeeks < 8) return SAMOYED_WEIGHT_NORMS[8];
  
  return norm;
}

/**
 * Генерация ASCII-графика веса
 * @param {Array} history - массив записей { weight, age_weeks }
 */
export function generateWeightGraph(history) {
  if (!history || history.length === 0) return 'Нет данных для графика.';

  const weights = history.map(h => h.weight);
  const minWeight = Math.min(...weights) * 0.9;
  const maxWeight = Math.max(...weights) * 1.1;
  const range = maxWeight - minWeight;
  const height = 5; // Высота графика в строках

  let graph = '📈 *График роста:*\n\n';
  
  // Упрощенный "sparkline" для telegram (используем точки)
  // Т.к. полноценный ASCII график сложен для форматирования на мобильных,
  // сделаем списком с барами
  
  history.forEach(rec => {
    const w = rec.weight;
    const norm = getWeightNorm(rec.age_weeks);
    
    // Статус: в норме, недобор, перебор
    let statusIcon = '✅';
    if (norm) {
      if (w < norm.min) statusIcon = '📉'; // Маловато
      if (w > norm.max) statusIcon = '⚠️'; // Многовато
    }
    
    // Длина бара относительно макс веса в выборке
    const barLen = Math.round((w / maxWeight) * 10);
    const bar = '█'.repeat(barLen);
    
    graph += `${rec.age_weeks} нед: ${bar} ${w}кг ${statusIcon}\n`;
  });

  return graph;
}
