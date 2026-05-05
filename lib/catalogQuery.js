import { createRequire } from 'module';
import { getCatalogProductsByCategory as getDefaultCatalogProductsByCategory } from './catalog.js';
import {
  getConductorMaterial,
  getCoreVariantLabel,
  getWireConstruction,
} from './catalogClassifiers.js';
import {
  applyProductFiltersCore,
  buildCatalogFacetsCore,
  sortProductsCore,
} from '../shared/catalogQueryCore.js';

const require = createRequire(import.meta.url);
const catalogCategoriesData = require('../shared/catalogCategories.json');

export const DEFAULT_PRODUCTS_LIMIT = 24;
export const MAX_PRODUCTS_LIMIT = 96;
export const DEFAULT_FACET_CACHE_TTL_MS = 60_000;

// Реэкспорт для обратной совместимости — у потребителей catalogQuery
// исторически работал доступ к классификаторам через этот модуль.
export { getConductorMaterial, getCoreVariantLabel, getWireConstruction };

const DEFAULT_CATALOG_ORDER = 9999;
export const MAX_SEARCH_INDEX_TOKEN_LENGTH = 48;
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
  const maxLength = Math.min(token.length, MAX_SEARCH_INDEX_TOKEN_LENGTH);
  for (let length = 1; length <= maxLength; length += 1) {
    addSearchToken(tokenMap, token.slice(0, length), product);
  }
}

function addSearchTokenSubstrings(tokenMap, token, product) {
  const boundedToken = token.slice(0, MAX_SEARCH_INDEX_TOKEN_LENGTH);
  for (let start = 0; start < boundedToken.length; start += 1) {
    for (let end = start + 1; end <= boundedToken.length; end += 1) {
      addSearchToken(tokenMap, boundedToken.slice(start, end), product);
    }
  }
}

function addSearchField(tokenMap, product, value, { substrings }) {
  const tokens = new Set(
    getSearchTokens(value).map((token) =>
      token.slice(0, MAX_SEARCH_INDEX_TOKEN_LENGTH)
    )
  );
  const compact = normalizeSearchKey(value).slice(
    0,
    MAX_SEARCH_INDEX_TOKEN_LENGTH
  );
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

  const boundedNormalizedSearch = normalizedSearch.slice(
    0,
    MAX_SEARCH_INDEX_TOKEN_LENGTH
  );
  const exactCandidates = searchIndex.tokenMap.get(boundedNormalizedSearch);
  if (exactCandidates) {
    return exactCandidates.filter((product) =>
      productMatchesSearch(product, query, normalizedSearch)
    );
  }

  const tokens = [...new Set(getSearchTokens(query))];
  const buckets = tokens
    .map((token) =>
      searchIndex.tokenMap.get(token.slice(0, MAX_SEARCH_INDEX_TOKEN_LENGTH))
    )
    .filter(Boolean);

  if (buckets.length === tokens.length && buckets.length > 0) {
    return orderSearchCandidates(
      intersectCandidateBuckets(buckets),
      searchIndex.itemOrder
    ).filter((product) =>
      productMatchesSearch(product, query, normalizedSearch)
    );
  }

  const candidateSource =
    buckets.length > 0
      ? orderSearchCandidates(buckets.flat(), searchIndex.itemOrder)
      : items;

  // Fallback keeps legacy substring behavior, but only scans prefix candidates
  // when the index can narrow the set.
  return candidateSource.filter((product) =>
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
  return buildCatalogFacetsCore(items);
}

function normalizeFacetCachePart(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

export function applyProductFilters(items, query) {
  const selectedMaterials = parseCsvParam(query.material);
  const selectedConstructions = parseCsvParam(query.construction);
  const selectedCores = parseCsvParam(query.cores);
  const selectedSections = parseCsvNumbers(query.section);
  const selectedVoltages = parseCsvNumbers(query.voltage);
  const selectedAppTypes = parseCsvParam(query.appType);
  const onlySPE = query.spe === '1';

  const minPrice = Number(query.priceMin);
  const maxPrice = Number(query.priceMax);
  return applyProductFiltersCore(items, {
    selectedMaterials,
    selectedConstructions,
    selectedCores,
    selectedSections,
    selectedVoltages,
    selectedAppTypes,
    onlySPE,
    priceMinNumber: Number.isFinite(minPrice) ? minPrice : null,
    priceMaxNumber: Number.isFinite(maxPrice) ? maxPrice : null,
  });
}

export function sortProducts(items, sortBy) {
  return sortProductsCore(items, sortBy);
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
