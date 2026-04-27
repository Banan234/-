import { useEffect, useMemo, useRef, useState } from 'react';
import ProductCard from '../ui/ProductCard';
import {
  getCoreVariantLabel,
  getConductorMaterial,
  getWireConstruction,
  formatVoltage,
} from '../../lib/catalogFilters';
import { trackEvent } from '../../lib/analytics';
import { useCatalogFilters } from '../../hooks/useCatalogFilters';

const PAGE_SIZE = 24;

function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set([1, totalPages]);
  for (
    let i = Math.max(1, currentPage - 2);
    i <= Math.min(totalPages, currentPage + 2);
    i++
  ) {
    pages.add(i);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const result = [];
  for (let i = 0; i < sorted.length; i++) {
    result.push(sorted[i]);
    if (i < sorted.length - 1 && sorted[i + 1] - sorted[i] > 1)
      result.push('...');
  }
  return result;
}

function scrollCatalogGridIntoView() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;
  const top = grid.getBoundingClientRect().top + window.scrollY;
  window.scrollTo({ top, behavior: 'smooth' });
}

export default function ProductListingView({
  products,
  isLoading,
  error,
  extraFilters = {},
  scopeKey,
  pagination = null,
  filterOptions: serverFilterOptions = null,
}) {
  const { showAppType = false, showSPE = false } = extraFilters;
  const {
    filters,
    filtersKey: catalogFiltersKey,
    updateParam,
    updateParams,
    toggleCsvParam,
    resetFilters,
  } = useCatalogFilters({ includeAdvancedFilters: showAppType || showSPE });
  const {
    search,
    priceMin,
    priceMax,
    priceMinNumber,
    priceMaxNumber,
    sortBy,
    selectedMaterials,
    selectedConstructions,
    selectedCores,
    selectedSections,
    selectedVoltages,
    selectedAppTypes,
    onlySPE,
  } = filters;

  const [searchInput, setSearchInput] = useState(search);
  const [priceMinInput, setPriceMinInput] = useState(priceMin);
  const [priceMaxInput, setPriceMaxInput] = useState(priceMax);
  const [localPage, setLocalPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(true);
  const isServerPaged = Boolean(pagination);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    setPriceMinInput(priceMin);
  }, [priceMin]);

  useEffect(() => {
    setPriceMaxInput(priceMax);
  }, [priceMax]);

  // Сбрасываем страницу при любой смене фильтров. Ключ строим один раз
  // из релевантных параметров — без этого зависимости пересоздавались бы
  // на каждый ререндер, провоцируя лишние прогоны эффекта.
  const filtersKey = useMemo(
    () => [scopeKey, catalogFiltersKey].join('|'),
    [scopeKey, catalogFiltersKey]
  );

  useEffect(() => {
    if (!isServerPaged) {
      setLocalPage(1);
    }
  }, [filtersKey, isServerPaged]);

  const searchDebounceRef = useRef(null);

  function commitSearch() {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current);
      searchDebounceRef.current = null;
    }
    const value = searchInput.trim();
    const previous = search.trim();
    if (value === previous) return;
    if (value) {
      trackEvent('search-submit', { query: value, source: 'catalog' });
    }
    updateParam('search', value);
  }

  // Дебаунсим автокоммит, чтобы клик по соседнему фильтру не отправлял
  // незаконченный запрос. Enter и кнопка очистки коммитят сразу.
  useEffect(() => {
    if (searchInput.trim() === search.trim()) return undefined;
    const timer = setTimeout(() => {
      searchDebounceRef.current = null;
      commitSearch();
    }, 400);
    searchDebounceRef.current = timer;
    return () => clearTimeout(timer);
    // commitSearch замкнута на актуальный searchInput через сам эффект
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput, search]);

  function commitPriceRange() {
    const minVal = priceMinInput.trim();
    const maxVal = priceMaxInput.trim();
    updateParams({
      priceMin: minVal,
      priceMax: maxVal,
    });
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

  const localFilterOptions = useMemo(() => {
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
      if (product.catalogApplicationType)
        appTypeSet.add(product.catalogApplicationType);
      if (product.catalogType === 'СПЭ') hasSPE = true;
      const p = Number(product.price);
      if (Number.isFinite(p) && p > 0) {
        if (p < minPrice) minPrice = p;
        if (p > maxPrice) maxPrice = p;
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
  }, [searchedProducts]);

  const filteredProducts = useMemo(() => {
    if (isServerPaged) return products;

    let result = [...searchedProducts];

    if (selectedMaterials.length > 0) {
      result = result.filter((p) =>
        selectedMaterials.includes(getConductorMaterial(p))
      );
    }
    if (selectedConstructions.length > 0) {
      result = result.filter((p) =>
        selectedConstructions.includes(getWireConstruction(p))
      );
    }
    if (selectedCores.length > 0) {
      result = result.filter((p) =>
        selectedCores.includes(getCoreVariantLabel(p))
      );
    }
    if (selectedSections.length > 0) {
      result = result.filter((p) => selectedSections.includes(p.crossSection));
    }
    if (selectedVoltages.length > 0) {
      result = result.filter((p) => selectedVoltages.includes(p.voltage));
    }
    if (showAppType && selectedAppTypes.length > 0) {
      result = result.filter((p) =>
        selectedAppTypes.includes(p.catalogApplicationType)
      );
    }
    if (showSPE && onlySPE) {
      result = result.filter((p) => p.catalogType === 'СПЭ');
    }

    if (priceMinNumber !== null) {
      result = result.filter((p) => Number(p.price) >= priceMinNumber);
    }
    if (priceMaxNumber !== null) {
      result = result.filter((p) => Number(p.price) <= priceMaxNumber);
    }

    // «Цена по запросу» (price=0/null) всегда уезжает в конец списка —
    // и при возрастании, и при убывании. Иначе при price-asc такие позиции
    // оказывались бы первыми, что вводит снабженца в заблуждение.
    const sortPrice = (p) => {
      const value = Number(p.price);
      return Number.isFinite(value) && value > 0 ? value : null;
    };
    if (sortBy === 'price-asc') {
      result.sort((a, b) => {
        const pa = sortPrice(a);
        const pb = sortPrice(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pa - pb;
      });
    }
    if (sortBy === 'price-desc') {
      result.sort((a, b) => {
        const pa = sortPrice(a);
        const pb = sortPrice(b);
        if (pa === null && pb === null) return 0;
        if (pa === null) return 1;
        if (pb === null) return -1;
        return pb - pa;
      });
    }
    if (sortBy === 'title-asc')
      result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
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
    priceMinNumber,
    priceMaxNumber,
    sortBy,
    isServerPaged,
    products,
  ]);

  const filterOptions = serverFilterOptions || localFilterOptions;
  const page = pagination?.page || localPage;
  const resultCount = pagination?.total ?? filteredProducts.length;
  const totalPages =
    pagination?.totalPages || Math.ceil(filteredProducts.length / PAGE_SIZE);
  const visibleProducts = isServerPaged
    ? products
    : filteredProducts.slice(
        (localPage - 1) * PAGE_SIZE,
        localPage * PAGE_SIZE
      );

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

    if (isServerPaged) {
      updateParam('page', normalizedPage > 1 ? normalizedPage : '');
    } else {
      setLocalPage(normalizedPage);
    }
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
            name="catalog-search"
            className="catalog-search-bar__input"
            placeholder="Поиск по марке или названию: ВВГнг-LS 3×2.5"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
          />
          {search && (
            <button
              type="button"
              className="catalog-search-bar__clear"
              onClick={() => {
                if (searchDebounceRef.current) {
                  clearTimeout(searchDebounceRef.current);
                  searchDebounceRef.current = null;
                }
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
            <span className="catalog-filter-panel__title">
              Подбор по параметрам
            </span>
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
                  <span className="catalog-filter-row__label">
                    Материал жилы
                  </span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.materials.map((mat) => (
                      <button
                        key={mat}
                        type="button"
                        aria-pressed={selectedMaterials.includes(mat)}
                        className={`catalog-filter-tag${
                          selectedMaterials.includes(mat)
                            ? ' catalog-filter-tag--active'
                            : ''
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
                  <span className="catalog-filter-row__label">
                    Исполнение жилы
                  </span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.constructions.map((construction) => (
                      <button
                        key={construction}
                        type="button"
                        aria-pressed={selectedConstructions.includes(
                          construction
                        )}
                        className={`catalog-filter-tag${
                          selectedConstructions.includes(construction)
                            ? ' catalog-filter-tag--active'
                            : ''
                        }`}
                        onClick={() =>
                          toggleCsvParam('construction', construction)
                        }
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
                        aria-pressed={selectedCores.includes(core)}
                        className={`catalog-filter-tag${
                          selectedCores.includes(core)
                            ? ' catalog-filter-tag--active'
                            : ''
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
                  <span className="catalog-filter-row__label">
                    Сечение, мм²
                  </span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.sections.map((section) => (
                      <button
                        key={section}
                        type="button"
                        aria-pressed={selectedSections.includes(section)}
                        className={`catalog-filter-tag${
                          selectedSections.includes(section)
                            ? ' catalog-filter-tag--active'
                            : ''
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
                  <span className="catalog-filter-row__label">
                    Напряжение, кВ
                  </span>
                  <div className="catalog-filter-row__tags">
                    {filterOptions.voltages.map((v) => (
                      <button
                        key={v}
                        type="button"
                        aria-pressed={selectedVoltages.includes(v)}
                        className={`catalog-filter-tag${
                          selectedVoltages.includes(v)
                            ? ' catalog-filter-tag--active'
                            : ''
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
                        aria-pressed={selectedAppTypes.includes(t)}
                        className={`catalog-filter-tag${
                          selectedAppTypes.includes(t)
                            ? ' catalog-filter-tag--active'
                            : ''
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
                  <span className="catalog-filter-row__label">
                    Тип изоляции
                  </span>
                  <div className="catalog-filter-row__tags">
                    <button
                      type="button"
                      aria-pressed={onlySPE}
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
            <label className="catalog-filter-panel__sort-label">
              Сортировка:
            </label>
            <select
              value={sortBy}
              onChange={(e) =>
                updateParam(
                  'sort',
                  e.target.value === 'default' ? '' : e.target.value
                )
              }
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
                Найдено: <strong>{resultCount}</strong> товаров
              </>
            )}
          </div>
        </div>
      )}

      {error ? (
        <div className="catalog-empty">{error}</div>
      ) : isLoading ? (
        <div className="catalog-empty">Подготавливаем товары из прайса...</div>
      ) : resultCount > 0 ? (
        <>
          <div
            id="catalog-grid"
            className="catalog-grid-anchor"
            aria-hidden="true"
          />
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
        <div className="catalog-empty">
          По вашему запросу товары не найдены.
        </div>
      )}
    </>
  );
}
