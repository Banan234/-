export function loadStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);

    if (!raw) {
      return fallback;
    }

    return JSON.parse(raw);
  } catch (error) {
    console.error(`Ошибка чтения "${key}" из localStorage:`, error);
    return fallback;
  }
}

export function saveStoredJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Ошибка сохранения "${key}" в localStorage:`, error);
  }
}

export function removeStoredValue(key) {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.error(`Ошибка удаления "${key}" из localStorage:`, error);
  }
}
