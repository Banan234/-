import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const BASE_PRODUCT_QUERY_KEYS = [
  'search',
  'priceMin',
  'priceMax',
  'material',
  'construction',
  'cores',
  'section',
  'voltage',
  'sort',
  'page',
];
const ADVANCED_PRODUCT_QUERY_KEYS = ['appType', 'spe'];
const RESET_FILTER_KEYS = [
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
  'page',
];

function parseCsvParam(raw) {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseCsvNumbers(raw) {
  return parseCsvParam(raw)
    .map((item) => Number(item))
    .filter((item) => Number.isFinite(item));
}

function parsePositiveNumber(raw) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function setParamValue(params, key, value) {
  if (
    value === null ||
    value === undefined ||
    value === '' ||
    value === false
  ) {
    params.delete(key);
    return;
  }

  params.set(key, String(value));
}

export function parseCatalogFilters(searchParams) {
  return {
    category: searchParams.get('category') || '',
    search: searchParams.get('search') || '',
    priceMin: searchParams.get('priceMin') || '',
    priceMax: searchParams.get('priceMax') || '',
    priceMinNumber: parsePositiveNumber(searchParams.get('priceMin')),
    priceMaxNumber: parsePositiveNumber(searchParams.get('priceMax')),
    sortBy: searchParams.get('sort') || 'default',
    selectedMaterials: parseCsvParam(searchParams.get('material')),
    selectedConstructions: parseCsvParam(searchParams.get('construction')),
    selectedCores: parseCsvParam(searchParams.get('cores')),
    selectedSections: parseCsvNumbers(searchParams.get('section')),
    selectedVoltages: parseCsvNumbers(searchParams.get('voltage')),
    selectedAppTypes: parseCsvParam(searchParams.get('appType')),
    onlySPE: searchParams.get('spe') === '1',
  };
}

export function buildCatalogProductQueryOptions(
  searchParams,
  { limit, includeAdvancedFilters = false } = {}
) {
  const options = {};
  if (limit) {
    options.limit = limit;
  }

  const keys = includeAdvancedFilters
    ? [...BASE_PRODUCT_QUERY_KEYS, ...ADVANCED_PRODUCT_QUERY_KEYS]
    : BASE_PRODUCT_QUERY_KEYS;

  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) {
      options[key] = value;
    }
  }

  return options;
}

function createCatalogFiltersKey(filters) {
  return [
    filters.search,
    filters.priceMin,
    filters.priceMax,
    filters.sortBy,
    filters.selectedMaterials.join(','),
    filters.selectedConstructions.join(','),
    filters.selectedCores.join(','),
    filters.selectedSections.join(','),
    filters.selectedVoltages.join(','),
    filters.selectedAppTypes.join(','),
    filters.onlySPE ? '1' : '',
  ].join('|');
}

export function useCatalogFilters({
  limit,
  includeAdvancedFilters = false,
} = {}) {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.toString();
  const currentParams = useMemo(
    () => new URLSearchParams(searchQuery),
    [searchQuery]
  );

  const filters = useMemo(
    () => parseCatalogFilters(currentParams),
    [currentParams]
  );

  const productQueryOptions = useMemo(
    () =>
      buildCatalogProductQueryOptions(currentParams, {
        limit,
        includeAdvancedFilters,
      }),
    [currentParams, includeAdvancedFilters, limit]
  );

  const filtersKey = useMemo(() => createCatalogFiltersKey(filters), [filters]);

  const updateParams = useCallback(
    (values, { replace = false, resetPage = true } = {}) => {
      const next = new URLSearchParams(searchQuery);
      let shouldResetPage = false;

      for (const [key, value] of Object.entries(values)) {
        setParamValue(next, key, value);
        if (key !== 'page') {
          shouldResetPage = true;
        }
      }

      if (resetPage && shouldResetPage) {
        next.delete('page');
      }

      setSearchParams(next, { replace });
    },
    [searchQuery, setSearchParams]
  );

  const updateParam = useCallback(
    (key, value, options) => {
      updateParams({ [key]: value }, options);
    },
    [updateParams]
  );

  const toggleCsvParam = useCallback(
    (key, value) => {
      const valueString = String(value);
      const current = parseCsvParam(currentParams.get(key));
      const next = current.includes(valueString)
        ? current.filter((item) => item !== valueString)
        : [...current, valueString];

      updateParam(key, next.length > 0 ? next.join(',') : '');
    },
    [currentParams, updateParam]
  );

  const resetFilters = useCallback(() => {
    const next = new URLSearchParams(searchQuery);
    RESET_FILTER_KEYS.forEach((key) => next.delete(key));
    setSearchParams(next, { replace: false });
  }, [searchQuery, setSearchParams]);

  return {
    searchParams,
    setSearchParams,
    searchQuery,
    filters,
    filtersKey,
    productQueryOptions,
    updateParam,
    updateParams,
    toggleCsvParam,
    resetFilters,
  };
}
