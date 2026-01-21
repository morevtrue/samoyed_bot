
/**
 * Рассчитать порцию корма (натуралка/мясо)
 * @param {number} ageWeeks - возраст в неделях
 * @param {number} weightKg - вес в кг
 */
export function calculateFoodPortion(ageWeeks, weightKg) {
  let percentage;
  
  // Переводим недели в месяцы (примерно)
  const ageMonths = ageWeeks / 4.3;

  if (ageMonths < 6) {
    percentage = 0.05; // 5% от веса (активный рост)
  } else if (ageMonths < 12) {
    percentage = 0.04; // 4% от веса (подросток)
  } else {
    percentage = 0.03; // 3% от веса (взрослый)
  }
  
  const dailyGrams = weightKg * 1000 * percentage;
  
  // Количество кормлений
  // До 3 мес - 4-5 раз (упростим до < 3 мес = 4)
  // 3-6 мес - 3 раза
  // старше 6 мес - 2 раза
  let meals = 2;
  if (ageMonths < 3) meals = 4;
  else if (ageMonths < 6) meals = 3;
  
  return {
    dailyTotal: Math.round(dailyGrams),
    perMeal: Math.round(dailyGrams / meals),
    meals,
    percentage: percentage * 100
  };
}

/**
 * Рассчитать порцию сухого корма (по калорийности)
 * @param {number} ageWeeks
 * @param {number} weightKg
 */
export function calculateDryFoodPortion(ageWeeks, weightKg) {
  // RER (Resting Energy Requirement) = 70 * (weight ^ 0.75)
  const RER = 70 * Math.pow(weightKg, 0.75);
  
  const ageMonths = ageWeeks / 4.3;
  let factor = 1.6; // Взрослый (кастрированный/малоактивный)
  
  if (ageMonths < 4) factor = 3.0;
  else if (ageMonths < 6) factor = 2.5;
  else if (ageMonths < 12) factor = 2.0;
  else factor = 1.8; // Взрослый активный (самоед)

  // Потребность в ккал
  const dailyKcal = RER * factor;
  
  // Средняя калорийность корма для щенков/активных собак: ~3800 ккал/кг (3.8 ккал/г)
  const kcalPerGram = 3.8;
  
  const dailyGrams = dailyKcal / kcalPerGram;

  let meals = 2;
  if (ageMonths < 3) meals = 4;
  else if (ageMonths < 6) meals = 3;

  return {
    dailyTotal: Math.round(dailyGrams),
    perMeal: Math.round(dailyGrams / meals),
    meals,
    dailyKcal: Math.round(dailyKcal)
  };
}
