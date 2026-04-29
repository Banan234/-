export const STORAGE_WRITE_FAILED_EVENT = 'yuzhural:storage-write-failed';

export function isStorageQuotaError(error) {
  return Boolean(
    error &&
    (error.name === 'QuotaExceededError' ||
      error.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
      error.code === 22 ||
      error.code === 1014)
  );
}

function emitStorageWriteFailure(key, error) {
  const target = typeof window !== 'undefined' ? window : globalThis;
  if (
    !target ||
    typeof target.dispatchEvent !== 'function' ||
    typeof CustomEvent !== 'function'
  ) {
    return;
  }

  target.dispatchEvent(
    new CustomEvent(STORAGE_WRITE_FAILED_EVENT, {
      detail: {
        key,
        reason: isStorageQuotaError(error) ? 'quota' : 'write_failed',
        isQuotaExceeded: isStorageQuotaError(error),
        errorName: error?.name || '',
        errorMessage: error?.message || '',
      },
    })
  );
}

export function loadStoredJson(key, fallback) {
  const storage = getLocalStorage();
  if (!storage) return fallback;

  try {
    const raw = storage.getItem(key);

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
  const storage = getLocalStorage();
  if (!storage) return false;

  try {
    storage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.error(`Ошибка сохранения "${key}" в localStorage:`, error);
    emitStorageWriteFailure(key, error);
    return false;
  }
}

export function removeStoredValue(key) {
  const storage = getLocalStorage();
  if (!storage) return false;

  try {
    storage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Ошибка удаления "${key}" из localStorage:`, error);
    return false;
  }
}

function getLocalStorage() {
  if (import.meta.env?.SSR && import.meta.env?.MODE !== 'test') return null;

  const storage =
    typeof window !== 'undefined' && window.localStorage
      ? window.localStorage
      : globalThis.localStorage;
  if (!storage) return null;
  if (
    typeof storage.getItem !== 'function' ||
    typeof storage.setItem !== 'function' ||
    typeof storage.removeItem !== 'function'
  ) {
    return null;
  }
  return storage;
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
      const storage = getLocalStorage();
      if (!storage) return null;

      try {
        const raw = storage.getItem(key);
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
      const storage = getLocalStorage();
      if (!storage) return;

      try {
        storage.setItem(key, value);
      } catch (error) {
        console.error(`Ошибка сохранения "${key}" в localStorage:`, error);
        emitStorageWriteFailure(key, error);
      }
    },
    removeItem: (key) => {
      const storage = getLocalStorage();
      if (!storage) return;

      try {
        storage.removeItem(key);
      } catch (error) {
        console.error(`Ошибка удаления "${key}" из localStorage:`, error);
      }
    },
  };
}
