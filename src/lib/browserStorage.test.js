import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createMigratingItemsStorage } from './browserStorage.js';

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
    const legacy = [{ id: 1, title: 'ВВГ' }, { id: 2, title: 'СИП' }];
    memory.setItem('yuzhural-cart', JSON.stringify(legacy));

    const storage = createMigratingItemsStorage();
    const result = JSON.parse(storage.getItem('yuzhural-cart'));

    expect(result).toEqual({ state: { items: legacy }, version: 0 });
  });

  it('возвращает уже мигрированное значение как есть', () => {
    const persisted = JSON.stringify({ state: { items: [{ id: 5 }] }, version: 1 });
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

  it('возвращает null при битом JSON, не падает', () => {
    memory.setItem('yuzhural-cart', '{not json');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const storage = createMigratingItemsStorage();
    expect(storage.getItem('yuzhural-cart')).toBeNull();

    errSpy.mockRestore();
  });
});
