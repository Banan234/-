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

/**
 * Адаптер localStorage для zustand `persist`, который понимает старый формат
 * данных, существовавший до перехода на middleware (когда под ключом лежал
 * сырой массив товаров, а не обёртка `{ state, version }`).
 *
 * При первом чтении старого значения мы переупаковываем его в формат persist —
 * чтобы избранное и корзины пользователей не пропали после деплоя.
 */
export function createMigratingItemsStorage() {
  return {
    getItem: (key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;

        const parsed = JSON.parse(raw);

        // Старый формат: сырой массив. Переупаковываем под persist.
        if (Array.isArray(parsed)) {
          return JSON.stringify({ state: { items: parsed }, version: 0 });
        }

        return raw;
      } catch (error) {
        console.error(`Ошибка чтения "${key}" из localStorage:`, error);
        return null;
      }
    },
    setItem: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch (error) {
        console.error(`Ошибка сохранения "${key}" в localStorage:`, error);
      }
    },
    removeItem: (key) => {
      try {
        localStorage.removeItem(key);
      } catch (error) {
        console.error(`Ошибка удаления "${key}" из localStorage:`, error);
      }
    },
  };
}
