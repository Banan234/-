import { describe, it, expect } from 'vitest';
import {
  assignStableIdentity,
  buildOrphanSpecIndex,
  buildSlugRedirects,
  buildSpecKey,
  buildStableKey,
  specKeyFromStableKey,
} from './productRegistry.js';

function emptyRegistry() {
  return { version: 1, nextId: 1, entries: {} };
}

const NOW = '2026-04-28T00:00:00.000Z';
const LATER = '2026-04-28T01:00:00.000Z';

describe('buildStableKey / buildSpecKey', () => {
  it('specKey совпадает у позиций с разной маркой, но одинаковыми спеками', () => {
    const a = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      voltage: 660,
      manufacturer: 'Камкабель',
    };
    const b = { ...a, mark: 'ВВГнг(А)-LS' };
    expect(buildStableKey(a)).not.toBe(buildStableKey(b));
    expect(buildSpecKey(a)).toBe(buildSpecKey(b));
  });

  it('specKeyFromStableKey срезает первую компоненту', () => {
    expect(specKeyFromStableKey('ввг|3|2.5|660|||камкабель|')).toBe(
      '|3|2.5|660|||камкабель|'
    );
    expect(specKeyFromStableKey('')).toBe('');
  });
});

describe('assignStableIdentity', () => {
  it('создаёт новую запись с id, slug и sku', () => {
    const registry = emptyRegistry();
    const result = assignStableIdentity(
      registry,
      { mark: 'ВВГ', cores: 3, crossSection: 2.5, fullName: 'ВВГ 3х2.5' },
      NOW
    );
    expect(result.id).toBe(1);
    expect(result.slug).toBe('vvg-3h2-5-1');
    expect(result.sku).toBe('YU-0000001');
    expect(registry.nextId).toBe(2);
  });

  it('повторное появление той же позиции переиспользует запись', () => {
    const registry = emptyRegistry();
    const product = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const first = assignStableIdentity(registry, product, NOW);
    const second = assignStableIdentity(registry, product, LATER);
    expect(second.id).toBe(first.id);
    expect(second.slug).toBe(first.slug);
    expect(registry.entries[buildStableKey(product)].lastSeen).toBe(LATER);
  });
});

describe('rename detection (orphan по spec-ключу)', () => {
  it('переименование сохраняет id/sku и пушит старый slug в slugHistory', () => {
    const registry = emptyRegistry();
    const original = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const renamed = {
      ...original,
      mark: 'ВВГнг(А)-LS',
      fullName: 'ВВГнг(А)-LS 3х2.5',
    };

    const before = assignStableIdentity(registry, original, NOW);

    // Новый импорт: в нём только переименованная позиция, оригинальная исчезла.
    const currentStableKeys = new Set([buildStableKey(renamed)]);
    const orphanIndex = buildOrphanSpecIndex(registry, currentStableKeys);
    const after = assignStableIdentity(registry, renamed, LATER, {
      orphanIndex,
    });

    expect(after.id).toBe(before.id);
    expect(after.sku).toBe(before.sku);
    expect(after.slug).not.toBe(before.slug);

    // Старая запись должна исчезнуть, новая — содержать slugHistory.
    expect(registry.entries[buildStableKey(original)]).toBeUndefined();
    const newEntry = registry.entries[buildStableKey(renamed)];
    expect(newEntry.slugHistory).toEqual([before.slug]);
  });

  it('не склеивает две живые записи: если оригинал ещё в импорте, новая позиция получает свой id', () => {
    const registry = emptyRegistry();
    const original = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const sibling = {
      mark: 'ВВГнг(А)-LS',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГнг(А)-LS 3х2.5',
    };

    const before = assignStableIdentity(registry, original, NOW);

    // В новом импорте присутствуют ОБА варианта.
    const currentStableKeys = new Set([
      buildStableKey(original),
      buildStableKey(sibling),
    ]);
    const orphanIndex = buildOrphanSpecIndex(registry, currentStableKeys);
    const after = assignStableIdentity(registry, sibling, LATER, {
      orphanIndex,
    });

    expect(after.id).not.toBe(before.id);
    expect(registry.entries[buildStableKey(original)]).toBeDefined();
    expect(registry.entries[buildStableKey(sibling)]).toBeDefined();
  });

  it('osiротевшая запись расходуется только один раз (один rename → один кандидат)', () => {
    const registry = emptyRegistry();
    const original = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const renamed1 = { ...original, mark: 'ВВГнг-LS' };
    const renamed2 = { ...original, mark: 'ВВГнг(А)-LS' };

    const before = assignStableIdentity(registry, original, NOW);

    const currentStableKeys = new Set([
      buildStableKey(renamed1),
      buildStableKey(renamed2),
    ]);
    const orphanIndex = buildOrphanSpecIndex(registry, currentStableKeys);

    const r1 = assignStableIdentity(registry, renamed1, LATER, { orphanIndex });
    const r2 = assignStableIdentity(registry, renamed2, LATER, { orphanIndex });

    // Один из двух унаследует id оригинала, второй получит новый.
    const ids = [r1.id, r2.id].sort();
    expect(ids).toEqual([before.id, before.id + 1]);
  });

  it('накапливает slugHistory через серию переименований', () => {
    const registry = emptyRegistry();
    const v1 = {
      mark: 'ВВГ',
      cores: 3,
      crossSection: 2.5,
      fullName: 'ВВГ 3х2.5',
    };
    const v2 = { ...v1, mark: 'ВВГнг', fullName: 'ВВГнг 3х2.5' };
    const v3 = { ...v1, mark: 'ВВГнг(А)-LS', fullName: 'ВВГнг(А)-LS 3х2.5' };

    const r1 = assignStableIdentity(registry, v1, NOW);

    let orphanIndex = buildOrphanSpecIndex(
      registry,
      new Set([buildStableKey(v2)])
    );
    const r2 = assignStableIdentity(registry, v2, LATER, { orphanIndex });

    orphanIndex = buildOrphanSpecIndex(registry, new Set([buildStableKey(v3)]));
    const r3 = assignStableIdentity(registry, v3, LATER, { orphanIndex });

    expect(r3.id).toBe(r1.id);
    const entry = registry.entries[buildStableKey(v3)];
    expect(entry.slugHistory).toEqual([r1.slug, r2.slug]);
  });
});

describe('buildSlugRedirects', () => {
  it('строит map старый-slug → актуальный-slug по slugHistory', () => {
    const registry = {
      version: 1,
      nextId: 3,
      entries: {
        'a|...': { id: 1, slug: 'new-1', slugHistory: ['old-a', 'older-a'] },
        'b|...': { id: 2, slug: 'fresh-2', slugHistory: [] },
      },
    };
    expect(buildSlugRedirects(registry)).toEqual({
      'old-a': 'new-1',
      'older-a': 'new-1',
    });
  });

  it('пустой map при отсутствии переименований', () => {
    expect(buildSlugRedirects(emptyRegistry())).toEqual({});
  });
});
