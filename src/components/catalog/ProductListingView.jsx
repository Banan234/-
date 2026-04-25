import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../ui/ProductCard';
import {
  getCoreVariantLabel,
  getConductorMaterial,
  getWireConstruction,
  formatVoltage,
} from '../../lib/catalogFilters';
import { trackEvent } from '../../lib/analytics';

const PAGE_SIZE = 24;

function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages]);
  for (let i = Math.max(1, currentPage - 2); i <= Math.min(totalPages, currentPage + 2); i++) {
    pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1) result.push('...');
  }
  return result;
}

function scrollCatalogGridIntoView() {
  document.getElementById('catalog-grid')?.scrollIntoView({
    behavior: 'smooth',
    block: 'start',
  });
}

function parseCsvParam(raw) {
  if (!raw) return [];
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

function parseCsvNumbers(raw) {
  return parseCsvParam(raw)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v));
}

export default function ProductListingView({
  products,
  isLoading,
  error,
  extraFilters = {},
  scopeKey,
}) {
  const { showAppType = false, showSPE = false } = extraFilters;
  const [searchParams, setSearchParams] = useSearchParams();

  const search = searchParams.get('search') || '';
  const priceMin = searchParams.get('priceMin') || '';
  const priceMax = searchParams.get('priceMax') || '';
  const sortBy = searchParams.get('sort') || 'default';
  const selectedMaterials = parseCsvParam(searchParams.get('material'));
  const selectedConstructions = parseCsvParam(searchParams.get('construction'));
  const selectedCores = parseCsvParam(searchParams.get('cores'));
  const selectedSections = parseCsvNumbers(searchParams.get('section'));
  const selectedVoltages = parseCsvNumbers(searchParams.get('voltage'));
  const selectedAppTypes = parseCsvParam(searchParams.get('appType'));
  const onlySPE = searchParams.get('spe') === '1';

  const [searchInput, setSearchInput] = useState(search);
  const [priceMinInput, setPriceMinInput] = useState(priceMin);
  const [priceMaxInput, setPriceMaxInput] = useState(priceMax);
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    setPriceMinInput(priceMin);
  }, [priceMin]);

  useEffect(() => {
    setPriceMaxInput(priceMax);
  }, [priceMax]);

  useEffect(() => {
    setPage(1);
  }, [
    scopeKey,
    search,
    priceMin,
    priceMax,
    sortBy,
    searchParams.get('material'),
    searchParams.get('construction'),
    searchParams.get('cores'),
    searchParams.get('section'),
    searchParams.get('voltage'),
    searchParams.get('appType'),
    searchParams.get('spe'),
  ]);

  function updateParam(key, value) {
    const next = new URLSearchParams(searchParams);
    if (value === null || value === undefined || value === '' || value === false) {
      next.delete(key);
    } else {
      next.set(key, String(value));
    }
    setSearchParams(next, { replace: false });
  }

  function toggleCsvParam(key, value) {
    const current = parseCsvParam(searchParams.get(key));
    const next = current.includes(String(value))
      ? current.filter((v) => v !== String(value))
      : [...current, String(value)];
    updateParam(key, next.length > 0 ? next.join(',') : '');
  }

  function resetFilters() {
    const next = new URLSearchParams(searchParams);
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
    ].forEach((k) => next.delete(k));
    setSearchParams(next, { replace: false });
  }

  function commitSearch() {
    const value = searchInput.trim();
    const previous = (searchParams.get('search') || '').trim();
    if (value && value !== previous) {
      trackEvent('search-submit', { query: value, source: 'catalog' });
    }
    updateParam('search', value);
  }

  function commitPriceRange() {
    updateParam('priceMin', priceMinInput.trim());
    // second update merges with first because setSearchParams reads latest in same microtask
    // but to be safe, build one params object:
    const next = new URLSearchParams(searchParams);
    const minVal = priceMinInput.trim();
    const maxVal = priceMaxInput.trim();
    if (minVal) next.set('priceMin', minVal); else next.delete('priceMin');
    if (maxVal) next.set('priceMax', maxVal); else next.delete('priceMax');
    setSearchParams(next, { replace: false });
  }

  const searchedProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter((product) => {
      const mark = (product.mark || '').toLowerCase();
      const title = (product.title || '').toLowerCase();
      const fullName = (product.fullName || '').toLowerCase();
      const sku = (product.sku || '').toLowerCase();
      return (
        mark.includes(q) ||
        title.includes(q) ||
        fullName.includes(q) ||
        sku.includes(q)
      );
    });
  }, [products, search]);

  const filterOptions = useMemo(() => {
    const materialSet = new Set();
    const constructionSet = new Set();
    const coreSet = new Set();
    const sectionSet = new Set();
    const voltageSet = new Set();
    const appTypeSet = new Set();
    let hasSPE = false;
    let minPrice = Infinity;
    let maxPrice = -Infinity;

    for (const product of searchedProducts) {
      materialSet.add(getConductorMaterial(product));
      constructionSet.add(getWireConstruction(product));
      const coreVariant = getCoreVariantLabel(product);
      if (coreVariant) coreSet.add(coreVariant);
      if (product.crossSection) sectionSet.add(product.crossSection);
      if (product.voltage != null) voltageSet.add(product.voltage);
      if (product.catalogApplicationType) appTypeSet.add(product.catalogApplicationType);
      if (product.catalogType === 'СПЭ') hasSPE = true;
      const p = Number(product.price);
      if (Number.isFinite(p) && p > 0) {
        if (p < minPrice) minPrice = p;
        if (p > maxPrice) maxPrice = p;
      }
    }

    return {
      materials: [...materialSet].sort((a, b) => a.localeCompare(b, 'ru')),
      constructions: [...constructionSet].sort((a, b) => a.localeCompare(b, 'ru')),
      cores: [...coreSet].sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })),
      sections: [...sectionSet].sort((a, b) => a - b),
      voltages: [...voltageSet].sort((a, b) => a - b),
      appTypes: [...appTypeSet].sort((a, b) => a.localeCompare(b, 'ru')),
      hasSPE,
      minPrice: Number.isFinite(minPrice) ? minPrice : 0,
      maxPrice: Number.isFinite(maxPrice) ? maxPrice : 0,
    };
  }, [searchedProducts]);

  const filteredProducts = useMemo(() => {
    let result = [...searchedProducts];

    if (selectedMaterials.length > 0) {
      result = result.filter((p) => selectedMaterials.includes(getConductorMaterial(p)));
    }
    if (selectedConstructions.length > 0) {
      result = result.filter((p) => selectedConstructions.includes(getWireConstruction(p)));
    }
    if (selectedCores.length > 0) {
      result = result.filter((p) => selectedCores.includes(getCoreVariantLabel(p)));
    }
    if (selectedSections.length > 0) {
      result = result.filter((p) => selectedSections.includes(p.crossSection));
    }
    if (selectedVoltages.length > 0) {
      result = result.filter((p) => selectedVoltages.includes(p.voltage));
    }
    if (showAppType && selectedAppTypes.length > 0) {
      result = result.filter((p) => selectedAppTypes.includes(p.catalogApplicationType));
    }
    if (showSPE && onlySPE) {
      result = result.filter((p) => p.catalogType === 'СПЭ');
    }

    const minNum = Number(priceMin);
    const maxNum = Number(priceMax);
    if (Number.isFinite(minNum) && minNum > 0) {
      result = result.filter((p) => Number(p.price) >= minNum);
    }
    if (Number.isFinite(maxNum) && maxNum > 0) {
      result = result.filter((p) => Number(p.price) <= maxNum);
    }

    if (sortBy === 'price-asc') result.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') result.sort((a, b) => b.price - a.price);
    if (sortBy === 'title-asc') result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    if (sortBy === 'popular') result.sort((a, b) => b.stock - a.stock);

    return result;
  }, [
    searchedProducts,
    selectedMaterials,
    selectedConstructions,
    selectedCores,
    selectedSections,
    selectedVoltages,
    selectedAppTypes,
    onlySPE,
    showAppType,
    showSPE,
    priceMin,
    priceMax,
    sortBy,
  ]);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const visibleProducts = filteredProducts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const hasActiveFilters =
    selectedMaterials.length > 0 ||
    selectedConstructions.length > 0 ||
    selectedCores.length > 0 ||
    selectedSections.length > 0 ||
    selectedVoltages.length > 0 ||
    (showAppType && selectedAppTypes.length > 0) ||
    (showSPE && onlySPE) ||
    !!priceMin ||
    !!priceMax ||
    !!search;

  const hasAnyFilterOption =
    filterOptions.materials.length > 0 ||
    filterOptions.constructions.length > 0 ||
    filterOptions.cores.length > 0 ||
    filterOptions.sections.length > 0 ||
    filterOptions.voltages.length > 0 ||
    (showAppType && filterOptions.appTypes.length > 0) ||
    (showSPE && filterOptions.hasSPE);

  function handlePageChange(nextPage) {
    const normalizedPage = Math.min(Math.max(nextPage, 1), totalPages);
    if (normalizedPage === page) return;

    setPage(normalizedPage);
    requestAnimationFrame(scrollCatalogGridIntoView);
  }

  return (
    <>
      <div className="catalog-search-bar">
        <form
          className="catalog-search-bar__form"
          onSubmit={(e) => {
            e.preventDefault();
            commitSearch();
          }}
        >
          <input
            type="search"
            className="catalog-search-bar__input"
            placeholder="Поиск по марке или названию: ВВГнг-LS 3×2.5"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onBlur={commitSearch}
          />
          {search && (
            <button
              type="button"
              className="catalog-search-bar__clear"
              onClick={() => {
                setSearchInput('');
                updateParam('search', '');
              }}
              aria-label="Очистить поиск"
            >
              ✕
            </button>
          )}
        </form>

        <form
          className="catalog-price-range"
          onSubmit={(e) => {
            e.preventDefault();
            commitPriceRange();
          }}
        >
          <span className="catalog-price-range__label">Цена, ₽</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            className="catalog-price-range__input"
            placeholder="от"
            value={priceMinInput}
            onChange={(e) => setPriceMinInput(e.target.value)}
            onBlur={commitPriceRange}
          />
          <span className="catalog-price-range__dash">—</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            className="catalog-price-range__input"
            placeholder="до"
            value={priceMaxInput}
            onChange={(e) => setPriceMaxInput(e.target.value)}
            onBlur={commitPriceRange}
          />
          <button type="submit" className="catalog-price-range__apply">
            OK
          </button>
        </form>
      </div>

      {hasAnyFilterOption && (
        <div className="catalog-filter-panel">
          <button
            type="button"
            className="catalog-filter-panel__head"
            onClick={() => setIsFilterOpen((v) => !v)}
          >
            <span className="catalog-filter-panel__title">Подбор по параметрам</span>
            <span
              className={`catalog-filter-panel__chevron${
                isFilterOpen ? ' catalog-filter-panel__chevron--open' : ''
              }`}
            >
              &#8679;
            </span>
          </button>

          {isFilterOpen && (
            <div className="catalog-filter-panel__body">
              {filterOptions.materials.length > 0 && (
                <div className="catalog-filter-row">
                  <span className="catalog-filter-row__label">Материал жилы</span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.materials.map((mat) => (
                      <button
                        key={mat}
                        type="button"
                        className={`catalog-filter-tag${
                          selectedMaterials.includes(mat) ? ' catalog-filter-tag--active' : ''
                        }`}
                        onClick={() => toggleCsvParam('material', mat)}
                      >
                        {mat}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterOptions.constructions.length > 0 && (
                <div className="catalog-filter-row">
                  <span className="catalog-filter-row__label">Исполнение жилы</span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.constructions.map((construction) => (
                      <button
                        key={construction}
                        type="button"
                        className={`catalog-filter-tag${
                          selectedConstructions.includes(construction)
                            ? ' catalog-filter-tag--active'
                            : ''
                        }`}
                        onClick={() => toggleCsvParam('construction', construction)}
                      >
                        {construction}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterOptions.cores.length > 0 && (
                <div className="catalog-filter-row">
                  <span className="catalog-filter-row__label">Кол-во жил</span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.cores.map((core) => (
                      <button
                        key={core}
                        type="button"
                        className={`catalog-filter-tag${
                          selectedCores.includes(core) ? ' catalog-filter-tag--active' : ''
                        }`}
                        onClick={() => toggleCsvParam('cores', core)}
                      >
                        {core}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterOptions.sections.length > 0 && (
                <div className="catalog-filter-row">
                  <span className="catalog-filter-row__label">Сечение, мм²</span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.sections.map((section) => (
                      <button
                        key={section}
                        type="button"
                        className={`catalog-filter-tag${
                          selectedSections.includes(section) ? ' catalog-filter-tag--active' : ''
                        }`}
                        onClick={() => toggleCsvParam('section', section)}
                      >
                        {section.toLocaleString('ru-RU')}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filterOptions.voltages.length > 0 && (
                <div className="catalog-filter-row">
                  <span className="catalog-filter-row__label">Напряжение, кВ</span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.voltages.map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`catalog-filter-tag${
                          selectedVoltages.includes(v) ? ' catalog-filter-tag--active' : ''
                        }`}
                        onClick={() => toggleCsvParam('voltage', v)}
                      >
                        {formatVoltage(v)}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showAppType && filterOptions.appTypes.length > 0 && (
                <div className="catalog-filter-row">
                  <span className="catalog-filter-row__label">Применение</span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.appTypes.map((t) => (
                      <button
                        key={t}
                        type="button"
                        className={`catalog-filter-tag${
                          selectedAppTypes.includes(t) ? ' catalog-filter-tag--active' : ''
                        }`}
                        onClick={() => toggleCsvParam('appType', t)}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {showSPE && filterOptions.hasSPE && (
                <div className="catalog-filter-row">
                  <span className="catalog-filter-row__label">Тип изоляции</span>
                  <div className="catalog-filter-row__tags">
                    <button
                      type="button"
                      className={`catalog-filter-tag${
                        onlySPE ? ' catalog-filter-tag--active' : ''
                      }`}
                      onClick={() => updateParam('spe', onlySPE ? '' : '1')}
                    >
                      Только СПЭ
                    </button>
                  </div>
                </div>
              )}

              <div className="catalog-filter-panel__footer">
                {hasActiveFilters && (
                  <button
                    type="button"
                    className="catalog-filter-panel__reset"
                    onClick={resetFilters}
                  >
                    ✕ Сбросить фильтр
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {!error && (
        <div className="catalog-filter-summary">
          <div className="catalog-filter-panel__sort">
            <label className="catalog-filter-panel__sort-label">Сортировка:</label>
            <select
              value={sortBy}
              onChange={(e) => updateParam('sort', e.target.value === 'default' ? '' : e.target.value)}
              className="catalog-sidebar__select catalog-filter-panel__sort-select"
            >
              <option value="default">По умолчанию</option>
              <option value="price-asc">Цена: по возрастанию</option>
              <option value="price-desc">Цена: по убыванию</option>
              <option value="title-asc">По названию</option>
              <option value="popular">По наличию</option>
            </select>
          </div>
          <div className="catalog-filter-panel__results">
            {isLoading ? (
              'Загружаем...'
            ) : (
              <>
                Найдено: <strong>{filteredProducts.length}</strong> товаров
              </>
            )}
          </div>
        </div>
      )}

      {error ? (
        <div className="catalog-empty">{error}</div>
      ) : isLoading ? (
        <div className="catalog-empty">Подготавливаем товары из прайса...</div>
      ) : filteredProducts.length > 0 ? (
        <>
          <div id="catalog-grid" className="catalog-grid-anchor" aria-hidden="true" />
          <div className="products-grid products-grid--catalog">
            {visibleProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="catalog-pagination">
              <button
                type="button"
                className="catalog-pagination__btn"
                disabled={page === 1}
                onClick={() => handlePageChange(page - 1)}
              >
                ← Назад
              </button>

              {getPageNumbers(page, totalPages).map((p, i) =>
                p === '...' ? (
                  <span key={`dots-${i}`} className="catalog-pagination__dots">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`catalog-pagination__page${
                      p === page ? ' catalog-pagination__page--active' : ''
                    }`}
                    onClick={() => handlePageChange(p)}
                  >
                    {p}
                  </button>
                )
              )}

              <button
                type="button"
                className="catalog-pagination__btn"
                disabled={page === totalPages}
                onClick={() => handlePageChange(page + 1)}
              >
                Вперёд →
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="catalog-empty">По вашему запросу товары не найдены.</div>
      )}
    </>
  );
}
