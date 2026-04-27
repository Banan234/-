import { describe, it, expect, vi } from 'vitest';
import {
  applyProductFilters,
  buildCatalogFacets,
  buildCatalogSearchIndex,
  buildProductSuggestions,
  createCatalogQueryStore,
  getSearchFilteredProducts,
  hasProductFilters,
  parseLimit,
  parsePage,
  sortProducts,
} from './catalogQuery.js';

const aluminum = {
  mark: 'АВВГ',
  title: 'Кабель АВВГ 3x2.5',
  fullName: 'АВВГ 3x2.5',
  sku: 'A-001',
  cableDecoded: { decoded: ['алюминиевые жилы'] },
  cores: 3,
  groundCores: 0,
  crossSection: 2.5,
  voltage: 660,
  catalogApplicationType: 'силовой',
  catalogType: 'ПВХ',
  price: 100,
  stock: 5,
};

const flexCopper = {
  mark: 'КГ',
  title: 'Кабель КГ 4x4',
  fullName: 'КГ 4x4',
  sku: 'C-002',
  cableDecoded: { decoded: ['медные жилы'] },
  cores: 4,
  groundCores: 1,
  crossSection: 4,
  voltage: 660,
  catalogApplicationType: 'гибкий',
  catalogType: 'СПЭ',
  price: 300,
  stock: 12,
};

const noPrice = {
  mark: 'ВВГ',
  title: 'Кабель ВВГ 1x1.5',
  fullName: 'ВВГ 1x1.5',
  sku: 'C-003',
  cableDecoded: { decoded: ['медные жилы'] },
  cores: 1,
  crossSection: 1.5,
  voltage: 380,
  catalogApplicationType: 'силовой',
  catalogType: 'ПВХ',
  price: 0,
  stock: 0,
};

const items = [aluminum, flexCopper, noPrice];

describe('getSearchFilteredProducts', () => {
  it('returns all items when query is empty', () => {
    expect(getSearchFilteredProducts(items, '')).toBe(items);
    expect(getSearchFilteredProducts(items, '   ')).toBe(items);
  });

  it('matches by mark, sku, or title (case-insensitive)', () => {
    expect(getSearchFilteredProducts(items, 'кг')).toEqual([flexCopper]);
    expect(getSearchFilteredProducts(items, 'A-001')).toEqual([aluminum]);
    expect(getSearchFilteredProducts(items, 'ВВГ')).toEqual([
      aluminum,
      noPrice,
    ]);
  });

  it('matches mark/SKU substrings through the search index', () => {
    const index = buildCatalogSearchIndex(items);

    expect(index.tokenMap.get('ввг')).toEqual([aluminum, noPrice]);
    expect(index.tokenMap.get('001')).toEqual([aluminum]);
  });

  it('matches dimension queries with latin/cyrillic x normalization', () => {
    expect(getSearchFilteredProducts(items, 'КГ 4х4')).toEqual([flexCopper]);
  });
});

describe('buildCatalogFacets', () => {
  it('aggregates materials, constructions, cores, sections, voltages, types', () => {
    const facets = buildCatalogFacets(items);
    expect(facets.materials).toEqual(
      expect.arrayContaining(['алюминий', 'медь'])
    );
    expect(facets.constructions).toEqual(
      expect.arrayContaining(['однопроволочная', 'многопроволочная'])
    );
    expect(facets.cores).toEqual(expect.arrayContaining(['1', '3', '4+1']));
    expect(facets.sections).toEqual([1.5, 2.5, 4]);
    expect(facets.voltages).toEqual([380, 660]);
    expect(facets.hasSPE).toBe(true);
  });

  it('skips zero/invalid prices for min/max', () => {
    const facets = buildCatalogFacets(items);
    expect(facets.minPrice).toBe(100);
    expect(facets.maxPrice).toBe(300);
  });

  it('returns 0 min/max for empty list', () => {
    expect(buildCatalogFacets([])).toMatchObject({
      minPrice: 0,
      maxPrice: 0,
      hasSPE: false,
    });
  });
});

describe('applyProductFilters', () => {
  it('returns input when query is empty', () => {
    expect(applyProductFilters(items, {})).toBe(items);
  });

  it('filters by material (CSV)', () => {
    expect(applyProductFilters(items, { material: 'алюминий' })).toEqual([
      aluminum,
    ]);
  });

  it('filters by construction (multi-CSV)', () => {
    expect(
      applyProductFilters(items, { construction: 'многопроволочная' })
    ).toEqual([flexCopper]);
  });

  it('filters by cross section (numeric CSV)', () => {
    expect(applyProductFilters(items, { section: '2.5,4' })).toEqual([
      aluminum,
      flexCopper,
    ]);
  });

  it('combines price range filters', () => {
    expect(
      applyProductFilters(items, { priceMin: '150', priceMax: '500' })
    ).toEqual([flexCopper]);
  });

  it('filters СПЭ-only when spe=1', () => {
    expect(applyProductFilters(items, { spe: '1' })).toEqual([flexCopper]);
  });
});

describe('sortProducts', () => {
  it('returns input for default/empty sort', () => {
    expect(sortProducts(items, undefined)).toBe(items);
    expect(sortProducts(items, 'default')).toBe(items);
  });

  it('sorts by price asc, pushing zero/null prices to end', () => {
    const sorted = sortProducts(items, 'price-asc');
    expect(sorted.map((p) => p.sku)).toEqual(['A-001', 'C-002', 'C-003']);
  });

  it('sorts by price desc', () => {
    const sorted = sortProducts(items, 'price-desc');
    expect(sorted.map((p) => p.sku)).toEqual(['C-002', 'A-001', 'C-003']);
  });

  it('sorts popular by stock desc', () => {
    const sorted = sortProducts(items, 'popular');
    expect(sorted.map((p) => p.sku)).toEqual(['C-002', 'A-001', 'C-003']);
  });

  it('does not mutate input', () => {
    const original = [...items];
    sortProducts(items, 'price-asc');
    expect(items).toEqual(original);
  });
});

describe('buildProductSuggestions', () => {
  it('returns empty for empty search', () => {
    expect(buildProductSuggestions(items, '', 10)).toEqual([]);
  });

  it('matches marks by prefix (case-insensitive, ё→е)', () => {
    const result = buildProductSuggestions(items, 'кг', 10);
    expect(result.map((s) => s.mark)).toEqual(['КГ']);
  });

  it('respects limit', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      mark: `АВВГ-${i}`,
    }));
    expect(buildProductSuggestions(many, 'аввг', 5)).toHaveLength(5);
  });
});

describe('hasProductFilters', () => {
  it('detects active filter and sort params', () => {
    expect(hasProductFilters({})).toBe(false);
    expect(hasProductFilters({ search: 'кг' })).toBe(true);
    expect(hasProductFilters({ sort: 'price-asc' })).toBe(true);
    expect(hasProductFilters({ sort: 'default' })).toBe(false);
    expect(hasProductFilters({ material: 'медь' })).toBe(true);
  });
});

describe('parsePage / parseLimit', () => {
  it('parsePage clamps to >= 1 and floors', () => {
    expect(parsePage(undefined)).toBe(1);
    expect(parsePage('0')).toBe(1);
    expect(parsePage('-3')).toBe(1);
    expect(parsePage('2.7')).toBe(2);
    expect(parsePage('5')).toBe(5);
  });

  it('parseLimit applies fallback and max', () => {
    expect(parseLimit(undefined, 24, 96)).toBe(24);
    expect(parseLimit('0', 24, 96)).toBe(24);
    expect(parseLimit('200', 24, 96)).toBe(96);
    expect(parseLimit('30', 24, 96)).toBe(30);
  });
});

describe('createCatalogQueryStore', () => {
  it('uses injected category lookup', () => {
    const lookup = vi.fn(() => [flexCopper]);
    const store = createCatalogQueryStore({
      getCatalogProductsByCategory: lookup,
    });

    expect(store.getCatalogQueryItems(items, 'custom-category')).toEqual([
      flexCopper,
    ]);
    expect(lookup).toHaveBeenCalledWith('custom-category', items);
  });

  it('keeps catalog section cache scoped to a store instance', () => {
    const storeA = createCatalogQueryStore();
    const storeB = createCatalogQueryStore();
    const sectionItemsA = [
      {
        catalogSection: 'Кабель и провод',
        catalogSectionSlug: 'kabel-i-provod',
        catalogCategory: 'Силовой кабель',
        catalogCategorySlug: 'silovoy-kabel',
      },
    ];
    const sectionItemsB = [
      {
        catalogSection: 'Специальные кабели',
        catalogSectionSlug: 'specialnye-kabeli',
        catalogCategory: 'Кабели судовые',
        catalogCategorySlug: 'kabeli-sudovye',
      },
    ];

    const sectionsA = storeA.getCatalogSections(sectionItemsA);
    const sectionsB = storeB.getCatalogSections(sectionItemsB);

    expect(storeA.getCatalogSections(sectionItemsA)).toBe(sectionsA);
    expect(sectionsB).toEqual([
      {
        name: 'Специальные кабели',
        slug: 'specialnye-kabeli',
        categories: [
          {
            name: 'Кабели судовые',
            slug: 'kabeli-sudovye',
            count: 1,
          },
        ],
      },
    ]);
  });

  it('caches search index per items identity and invalidates on reload', () => {
    const store = createCatalogQueryStore();
    const reloadedItems = [
      {
        ...flexCopper,
        sku: 'A-001',
      },
    ];

    expect(store.getSearchFilteredProducts(items, 'A-001')).toEqual([aluminum]);
    expect(store.getSearchFilteredProducts(reloadedItems, 'A-001')).toEqual([
      reloadedItems[0],
    ]);
  });

  it('caches facets by category/search until TTL expires', () => {
    let timestamp = 1000;
    const catalogItems = [...items];
    const store = createCatalogQueryStore({
      facetCacheTtlMs: 60_000,
      now: () => timestamp,
    });

    const first = store.getCatalogFacets([aluminum], {
      categorySlug: 'power-cable',
      search: 'avvg',
      catalogItems,
    });
    const cached = store.getCatalogFacets([flexCopper], {
      categorySlug: 'power-cable',
      search: 'AVVG',
      catalogItems,
    });

    expect(cached).toBe(first);

    timestamp += 60_001;

    const expired = store.getCatalogFacets([flexCopper], {
      categorySlug: 'power-cable',
      search: 'avvg',
      catalogItems,
    });

    expect(expired).not.toBe(first);
    expect(expired.materials).toEqual(['медь']);
  });

  it('invalidates facet cache when catalog identity changes', () => {
    const store = createCatalogQueryStore({ facetCacheTtlMs: 60_000 });
    const catalogItems = [...items];
    const reloadedCatalogItems = [...items];

    const first = store.getCatalogFacets([aluminum], {
      categorySlug: 'power-cable',
      search: '',
      catalogItems,
    });
    const invalidated = store.getCatalogFacets([flexCopper], {
      categorySlug: 'power-cable',
      search: '',
      catalogItems: reloadedCatalogItems,
    });

    expect(invalidated).not.toBe(first);
    expect(invalidated.materials).toEqual(['медь']);
  });
});
