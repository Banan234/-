import { createRequire } from 'module';
import { getCatalogProductsByCategory as getDefaultCatalogProductsByCategory } from './catalog.js';
import {
  getConductorMaterial,
  getCoreVariantLabel,
  getWireConstruction,
} from './catalogClassifiers.js';

const require = createRequire(import.meta.url);
const catalogCategoriesData = require('../shared/catalogCategories.json');

export const DEFAULT_PRODUCTS_LIMIT = 24;
export const MAX_PRODUCTS_LIMIT = 96;
export const DEFAULT_FACET_CACHE_TTL_MS = 60_000;

// Реэкспорт для обратной совместимости — у потребителей catalogQuery
// исторически работал доступ к классификаторам через этот модуль.
export { getConductorMaterial, getCoreVariantLabel, getWireConstruction };

const DEFAULT_CATALOG_ORDER = 9999;
const SEARCH_INDEX_FIELDS = [
  { key: 'mark', substrings: true },
  { key: 'sku', substrings: true },
  { key: 'title', substrings: false },
  { key: 'fullName', substrings: false },
];

export const CANONICAL_CATEGORY_ORDER = new Map(
  catalogCategoriesData.sections.flatMap((section) =>
    section.categories.map((category, index) => [category.slug, index])
  )
);

export function getCanonicalCategoryOrder(categorySlug) {
  return CANONICAL_CATEGORY_ORDER.get(categorySlug) ?? DEFAULT_CATALOG_ORDER;
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/(\d)\s*[xх×*]\s*(?=\d)/gi, '$1х');
}

export function normalizeSearchKey(value) {
  return normalizeSearchText(value).replace(/[^0-9a-zа-я]+/g, '');
}

export function parseCsvParam(value) {
  if (typeof value !== 'string' || !value.trim()) return [];
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseCsvNumbers(value) {
  return parseCsvParam(value)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function getSearchTokens(value) {
  return normalizeSearchText(value)
    .split(/[^0-9a-zа-я]+/)
    .map(normalizeSearchKey)
    .filter(Boolean);
}

function productMatchesSearch(product, search, normalizedSearch) {
  const query = String(search || '')
    .trim()
    .toLowerCase();
  if (!query) return true;

  for (const key of ['mark', 'title', 'fullName', 'sku']) {
    const value = String(product[key] || '');
    if (value.toLowerCase().includes(query)) return true;
    if (
      normalizedSearch &&
      normalizeSearchKey(value).includes(normalizedSearch)
    ) {
      return true;
    }
  }

  return false;
}

function addSearchToken(tokenMap, token, product) {
  if (!token) return;

  let bucket = tokenMap.get(token);
  if (!bucket) {
    bucket = new Set();
    tokenMap.set(token, bucket);
  }
  bucket.add(product);
}

function addSearchTokenPrefixes(tokenMap, token, product) {
  for (let length = 1; length <= token.length; length += 1) {
    addSearchToken(tokenMap, token.slice(0, length), product);
  }
}

function addSearchTokenSubstrings(tokenMap, token, product) {
  for (let start = 0; start < token.length; start += 1) {
    for (let end = start + 1; end <= token.length; end += 1) {
      addSearchToken(tokenMap, token.slice(start, end), product);
    }
  }
}

function addSearchField(tokenMap, product, value, { substrings }) {
  const tokens = new Set(getSearchTokens(value));
  const compact = normalizeSearchKey(value);
  if (compact) tokens.add(compact);

  for (const token of tokens) {
    if (substrings) {
      addSearchTokenSubstrings(tokenMap, token, product);
    } else {
      addSearchTokenPrefixes(tokenMap, token, product);
    }
  }
}

export function buildCatalogSearchIndex(items) {
  const tokenSets = new Map();
  const itemOrder = new Map();

  for (let index = 0; index < items.length; index += 1) {
    const product = items[index];
    itemOrder.set(product, index);

    for (const field of SEARCH_INDEX_FIELDS) {
      addSearchField(tokenSets, product, product[field.key], field);
    }
  }

  return {
    itemOrder,
    tokenMap: new Map(
      [...tokenSets.entries()].map(([token, products]) => [
        token,
        [...products],
      ])
    ),
  };
}

function intersectCandidateBuckets(buckets) {
  if (buckets.length === 0) return [];

  const [smallest, ...rest] = [...buckets].sort((a, b) => a.length - b.length);
  if (rest.length === 0) return smallest;

  const restSets = rest.map((bucket) => new Set(bucket));
  return smallest.filter((product) =>
    restSets.every((set) => set.has(product))
  );
}

function orderSearchCandidates(candidates, itemOrder) {
  return [...new Set(candidates)].sort(
    (a, b) => itemOrder.get(a) - itemOrder.get(b)
  );
}

function filterProductsWithSearchIndex(items, search, searchIndex) {
  const query = String(search || '').trim();
  if (!query) return items;

  const normalizedSearch = normalizeSearchKey(query);
  if (!normalizedSearch) return items;

  const exactCandidates = searchIndex.tokenMap.get(normalizedSearch);
  if (exactCandidates) {
    return exactCandidates.filter((product) =>
      productMatchesSearch(product, query, normalizedSearch)
    );
  }

  const tokens = [...new Set(getSearchTokens(query))];
  const buckets = tokens
    .map((token) => searchIndex.tokenMap.get(token))
    .filter(Boolean);

  if (buckets.length === tokens.length && buckets.length > 0) {
    return orderSearchCandidates(
      intersectCandidateBuckets(buckets),
      searchIndex.itemOrder
    ).filter((product) =>
      productMatchesSearch(product, query, normalizedSearch)
    );
  }

  // Fallback keeps legacy substring behavior for rare title/fullName queries
  // that are not represented by mark/SKU tokens.
  return items.filter((product) =>
    productMatchesSearch(product, query, normalizedSearch)
  );
}

export function getSearchFilteredProducts(items, search) {
  if (!String(search || '').trim()) return items;

  return filterProductsWithSearchIndex(
    items,
    search,
    buildCatalogSearchIndex(items)
  );
}

export function buildCatalogFacets(items) {
  const materialSet = new Set();
  const constructionSet = new Set();
  const coreSet = new Set();
  const sectionSet = new Set();
  const voltageSet = new Set();
  const appTypeSet = new Set();
  let hasSPE = false;
  let minPrice = Infinity;
  let maxPrice = -Infinity;

  for (const product of items) {
    materialSet.add(getConductorMaterial(product));
    constructionSet.add(getWireConstruction(product));

    const coreVariant = getCoreVariantLabel(product);
    if (coreVariant) coreSet.add(coreVariant);
    if (product.crossSection) sectionSet.add(product.crossSection);
    if (product.voltage != null) voltageSet.add(product.voltage);
    if (product.catalogApplicationType)
      appTypeSet.add(product.catalogApplicationType);
    if (product.catalogType === 'СПЭ') hasSPE = true;

    const price = Number(product.price);
    if (Number.isFinite(price) && price > 0) {
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    }
  }

  return {
    materials: [...materialSet].sort((a, b) => a.localeCompare(b, 'ru')),
    constructions: [...constructionSet].sort((a, b) =>
      a.localeCompare(b, 'ru')
    ),
    cores: [...coreSet].sort((a, b) =>
      a.localeCompare(b, 'ru', { numeric: true })
    ),
    sections: [...sectionSet].sort((a, b) => a - b),
    voltages: [...voltageSet].sort((a, b) => a - b),
    appTypes: [...appTypeSet].sort((a, b) => a.localeCompare(b, 'ru')),
    hasSPE,
    minPrice: Number.isFinite(minPrice) ? minPrice : 0,
    maxPrice: Number.isFinite(maxPrice) ? maxPrice : 0,
  };
}

function normalizeFacetCachePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function applyProductFilters(items, query) {
  let result = items;
  const selectedMaterials = parseCsvParam(query.material);
  const selectedConstructions = parseCsvParam(query.construction);
  const selectedCores = parseCsvParam(query.cores);
  const selectedSections = parseCsvNumbers(query.section);
  const selectedVoltages = parseCsvNumbers(query.voltage);
  const selectedAppTypes = parseCsvParam(query.appType);
  const onlySPE = query.spe === '1';

  if (selectedMaterials.length > 0) {
    result = result.filter((item) =>
      selectedMaterials.includes(getConductorMaterial(item))
    );
  }
  if (selectedConstructions.length > 0) {
    result = result.filter((item) =>
      selectedConstructions.includes(getWireConstruction(item))
    );
  }
  if (selectedCores.length > 0) {
    result = result.filter((item) =>
      selectedCores.includes(getCoreVariantLabel(item))
    );
  }
  if (selectedSections.length > 0) {
    result = result.filter((item) =>
      selectedSections.includes(item.crossSection)
    );
  }
  if (selectedVoltages.length > 0) {
    result = result.filter((item) => selectedVoltages.includes(item.voltage));
  }
  if (selectedAppTypes.length > 0) {
    result = result.filter((item) =>
      selectedAppTypes.includes(item.catalogApplicationType)
    );
  }
  if (onlySPE) {
    result = result.filter((item) => item.catalogType === 'СПЭ');
  }

  const minPrice = Number(query.priceMin);
  const maxPrice = Number(query.priceMax);
  if (Number.isFinite(minPrice) && minPrice > 0) {
    result = result.filter((item) => Number(item.price) >= minPrice);
  }
  if (Number.isFinite(maxPrice) && maxPrice > 0) {
    result = result.filter((item) => Number(item.price) <= maxPrice);
  }

  return result;
}

function comparePrices(a, b, sortPrice, direction) {
  const priceA = sortPrice(a);
  const priceB = sortPrice(b);
  if (priceA === null && priceB === null) return 0;
  if (priceA === null) return 1;
  if (priceB === null) return -1;
  return direction === 1 ? priceA - priceB : priceB - priceA;
}

export function sortProducts(items, sortBy) {
  if (!sortBy || sortBy === 'default') return items;

  const result = [...items];
  const sortPrice = (product) => {
    const value = Number(product.price);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  if (sortBy === 'price-asc') {
    result.sort((a, b) => comparePrices(a, b, sortPrice, 1));
  } else if (sortBy === 'price-desc') {
    result.sort((a, b) => comparePrices(a, b, sortPrice, -1));
  } else if (sortBy === 'title-asc') {
    result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  } else if (sortBy === 'popular') {
    result.sort((a, b) => (b.stock || 0) - (a.stock || 0));
  }

  return result;
}

export function parsePage(value) {
  const page = Number(value);
  if (!Number.isFinite(page) || page <= 0) return 1;
  return Math.floor(page);
}

export function parseLimit(value, fallback, max) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.min(Math.floor(num), max);
}

function resolveCatalogQueryItems(
  allItems,
  category,
  getCatalogProductsByCategory
) {
  const categoryValue = typeof category === 'string' ? category.trim() : '';
  if (!categoryValue || categoryValue === 'Все') return allItems;

  const bySlug = getCatalogProductsByCategory(categoryValue, allItems);
  if (bySlug.length > 0 || CANONICAL_CATEGORY_ORDER.has(categoryValue)) {
    return bySlug;
  }

  return allItems.filter(
    (item) =>
      item.catalogCategory === categoryValue || item.category === categoryValue
  );
}

export function hasProductFilters(query) {
  return (
    [
      'search',
      'priceMin',
      'priceMax',
      'material',
      'construction',
      'cores',
      'section',
      'voltage',
      'appType',
      'spe',
    ].some((key) => typeof query[key] === 'string' && query[key].trim()) ||
    (typeof query.sort === 'string' &&
      query.sort.trim() &&
      query.sort !== 'default')
  );
}

export function buildProductSuggestions(items, search, limit) {
  const normalizedSearch = normalizeSearchKey(search);
  if (!normalizedSearch) return [];

  const markMap = new Map();

  for (const product of items) {
    const mark = String(product.mark || '').trim();
    if (!mark) continue;

    const key = normalizeSearchKey(mark);
    if (!key || !key.startsWith(normalizedSearch)) continue;

    const current = markMap.get(key);
    if (current) {
      current.count += 1;
    } else {
      markMap.set(key, { key, mark, count: 1 });
    }
  }

  return [...markMap.values()]
    .sort((a, b) => {
      const exactDiff =
        Number(b.key === normalizedSearch) - Number(a.key === normalizedSearch);
      if (exactDiff !== 0) return exactDiff;
      return b.count - a.count || a.mark.localeCompare(b.mark, 'ru');
    })
    .slice(0, limit);
}

function buildCatalogSections(items) {
  const sectionOrder = [];
  const sectionMap = new Map();

  for (const item of items) {
    const sectionSlug = item.catalogSectionSlug;
    const categorySlug = item.catalogCategorySlug;

    if (!sectionSlug || !categorySlug) {
      continue;
    }

    if (!sectionMap.has(sectionSlug)) {
      sectionOrder.push(sectionSlug);
      sectionMap.set(sectionSlug, {
        name: item.catalogSection,
        slug: sectionSlug,
        categoryOrder: [],
        categoryMap: new Map(),
      });
    }

    const section = sectionMap.get(sectionSlug);

    if (!section.categoryMap.has(categorySlug)) {
      section.categoryOrder.push(categorySlug);
      section.categoryMap.set(categorySlug, {
        name: item.catalogCategory,
        slug: categorySlug,
        count: 0,
      });
    }

    section.categoryMap.get(categorySlug).count++;
  }

  return sectionOrder.map((sectionSlug) => {
    const section = sectionMap.get(sectionSlug);
    const categories = section.categoryOrder
      .map((categorySlug) => section.categoryMap.get(categorySlug))
      .sort(
        (a, b) =>
          getCanonicalCategoryOrder(a.slug) - getCanonicalCategoryOrder(b.slug)
      );

    return {
      name: section.name,
      slug: section.slug,
      categories,
    };
  });
}

export function createCatalogQueryStore({
  getCatalogProductsByCategory = getDefaultCatalogProductsByCategory,
  facetCacheTtlMs = DEFAULT_FACET_CACHE_TTL_MS,
  now = () => Date.now(),
} = {}) {
  let catalogSectionsCacheItems = null;
  let catalogSectionsCache = null;
  let catalogSearchIndexItems = null;
  let catalogSearchIndex = null;
  const facetCache = new Map();

  function reset() {
    catalogSectionsCacheItems = null;
    catalogSectionsCache = null;
    catalogSearchIndexItems = null;
    catalogSearchIndex = null;
    facetCache.clear();
  }

  function getCatalogQueryItems(allItems, category) {
    return resolveCatalogQueryItems(
      allItems,
      category,
      getCatalogProductsByCategory
    );
  }

  function getSearchIndex(items) {
    if (catalogSearchIndexItems !== items || !catalogSearchIndex) {
      catalogSearchIndexItems = items;
      catalogSearchIndex = buildCatalogSearchIndex(items);
    }

    return catalogSearchIndex;
  }

  function getSearchFilteredProducts(items, search) {
    if (!String(search || '').trim()) return items;

    return filterProductsWithSearchIndex(items, search, getSearchIndex(items));
  }

  function getCatalogFacets(
    items,
    { categorySlug = '', search = '', catalogItems = null } = {}
  ) {
    if (!Number.isFinite(facetCacheTtlMs) || facetCacheTtlMs <= 0) {
      return buildCatalogFacets(items);
    }

    const timestamp = now();
    const key = `${normalizeFacetCachePart(categorySlug)}\u0000${normalizeFacetCachePart(search)}`;
    const entry = facetCache.get(key);

    if (
      entry &&
      entry.expiresAt > timestamp &&
      entry.catalogItems === catalogItems
    ) {
      return entry.facets;
    }

    const facets = buildCatalogFacets(items);
    facetCache.set(key, {
      catalogItems,
      expiresAt: timestamp + facetCacheTtlMs,
      facets,
    });

    return facets;
  }

  function getCatalogSections(items) {
    if (catalogSectionsCacheItems === items && catalogSectionsCache) {
      return catalogSectionsCache;
    }

    catalogSectionsCacheItems = items;
    catalogSectionsCache = buildCatalogSections(items);
    return catalogSectionsCache;
  }

  return {
    reset,
    getCatalogQueryItems,
    getSearchFilteredProducts,
    getCatalogFacets,
    getCatalogSections,
  };
}

export const defaultCatalogQueryStore = createCatalogQueryStore();

export function getCatalogQueryItems(allItems, category) {
  return defaultCatalogQueryStore.getCatalogQueryItems(allItems, category);
}

export function getCatalogSearchFilteredProducts(items, search) {
  return defaultCatalogQueryStore.getSearchFilteredProducts(items, search);
}

export function getCatalogFacets(items, options) {
  return defaultCatalogQueryStore.getCatalogFacets(items, options);
}

export function getCatalogSections(items) {
  return defaultCatalogQueryStore.getCatalogSections(items);
}
