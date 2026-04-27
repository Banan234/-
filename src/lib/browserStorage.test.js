import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STORAGE_WRITE_FAILED_EVENT,
  createMigratingItemsStorage,
  isStorageQuotaError,
  saveStoredJson,
} from './browserStorage.js';

function createMemoryLocalStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
    get _store() {
      return store;
    },
  };
}

describe('createMigratingItemsStorage', () => {
  let memory;

  beforeEach(() => {
    memory = createMemoryLocalStorage();
    vi.stubGlobal('localStorage', memory);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('null, если ключа в storage нет', () => {
    const storage = createMigratingItemsStorage();
    expect(storage.getItem('missing')).toBeNull();
  });

  it('переупаковывает старый сырой массив в формат persist {state, version}', () => {
    const legacy = [
      { id: 1, title: 'ВВГ' },
      { id: 2, title: 'СИП' },
    ];
    memory.setItem('yuzhural-cart', JSON.stringify(legacy));

    const storage = createMigratingItemsStorage();
    const result = JSON.parse(storage.getItem('yuzhural-cart'));

    expect(result).toEqual({ state: { items: legacy }, version: 0 });
  });

  it('возвращает уже мигрированное значение как есть', () => {
    const persisted = JSON.stringify({
      state: { items: [{ id: 5 }] },
      version: 1,
    });
    memory.setItem('yuzhural-cart', persisted);

    const storage = createMigratingItemsStorage();
    expect(storage.getItem('yuzhural-cart')).toBe(persisted);
  });

  it('setItem пишет значение, removeItem удаляет', () => {
    const storage = createMigratingItemsStorage();
    storage.setItem('k', 'v');
    expect(memory.getItem('k')).toBe('v');
    storage.removeItem('k');
    expect(memory.getItem('k')).toBeNull();
  });

  it('сообщает о quota-ошибке записи через browser event', () => {
    const quotaError = Object.assign(new Error('quota exceeded'), {
      name: 'QuotaExceededError',
      code: 22,
    });
    memory.setItem = vi.fn(() => {
      throw quotaError;
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'CustomEvent',
      class {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      }
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const storage = createMigratingItemsStorage();
    storage.setItem('yuzhural-cart', '{"state":{"items":[]}}');

    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        type: STORAGE_WRITE_FAILED_EVENT,
        detail: expect.objectContaining({
          key: 'yuzhural-cart',
          reason: 'quota',
          isQuotaExceeded: true,
        }),
      })
    );

    errSpy.mockRestore();
  });

  it('saveStoredJson возвращает false при ошибке записи', () => {
    memory.setItem = vi.fn(() => {
      throw new Error('readonly storage');
    });
    const dispatchEvent = vi.fn();
    vi.stubGlobal('window', { dispatchEvent });
    vi.stubGlobal(
      'CustomEvent',
      class {
        constructor(type, init) {
          this.type = type;
          this.detail = init?.detail;
        }
      }
    );
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    expect(saveStoredJson('yuzhural-quote-form', { name: 'Иван' })).toBe(false);
    expect(dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({
          key: 'yuzhural-quote-form',
          reason: 'write_failed',
          isQuotaExceeded: false,
        }),
      })
    );

    errSpy.mockRestore();
  });

  it('возвращает null при битом JSON, не падает', () => {
    memory.setItem('yuzhural-cart', '{not json');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const storage = createMigratingItemsStorage();
    expect(storage.getItem('yuzhural-cart')).toBeNull();

    errSpy.mockRestore();
  });
});

describe('isStorageQuotaError', () => {
  it('распознаёт quota-коды разных браузеров', () => {
    expect(isStorageQuotaError({ name: 'QuotaExceededError' })).toBe(true);
    expect(isStorageQuotaError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(
      true
    );
    expect(isStorageQuotaError({ code: 22 })).toBe(true);
    expect(isStorageQuotaError({ code: 1014 })).toBe(true);
    expect(isStorageQuotaError(new Error('other'))).toBe(false);
  });
});
