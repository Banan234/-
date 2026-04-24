import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductCard from '../components/ui/ProductCard';
import { fetchProducts } from '../lib/productsApi';
import { getCoreVariantLabel, getConductorMaterial, getWireConstruction, formatVoltage } from '../lib/catalogFilters';
import { useSEO } from '../hooks/useSEO';

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

export default function CatalogPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeCategory = searchParams.get('category') || 'Все';

  useSEO({
    title:
      activeCategory && activeCategory !== 'Все'
        ? `Каталог: ${activeCategory}`
        : 'Каталог продукции',
    description:
      activeCategory && activeCategory !== 'Все'
        ? `Купить ${activeCategory.toLowerCase()} оптом. Актуальный прайс и наличие на складе в Челябинске. ЮжУралЭлектроКабель.`
        : 'Каталог кабельной и некабельной продукции. Кабель, провод, арматура и электрооборудование в наличии и под заказ.',
  });
  const [products, setProducts] = useState([]);
  const [catalogSections, setCatalogSections] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState(
    searchParams.get('category') || 'Все'
  );
  const [sortBy, setSortBy] = useState(searchParams.get('sort') || 'default');
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [selectedConstructions, setSelectedConstructions] = useState([]);
  const [selectedCores, setSelectedCores] = useState([]);
  const [selectedSections, setSelectedSections] = useState([]);
  const [selectedVoltages, setSelectedVoltages] = useState([]);
  const [page, setPage] = useState(1);
  const [isFilterOpen, setIsFilterOpen] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        setIsLoading(true);
        setError('');

        const result = await fetchProducts(controller.signal);
        setProducts(result.items);
        setCatalogSections(result.meta?.catalogSections || []);
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        console.error(requestError);
        setError(requestError.message || 'Не удалось загрузить каталог');
      } finally {
        setIsLoading(false);
      }
    }

    loadProducts();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const urlSearch = searchParams.get('search') || '';
    const urlCategory = searchParams.get('category') || 'Все';
    const urlSort = searchParams.get('sort') || 'default';

    setSearch(urlSearch);
    setSelectedCategory(urlCategory);
    setSortBy(urlSort);
    setPage(1);
  }, [searchParams]);

  useEffect(() => {
    setPage(1);
  }, [
    search,
    selectedCategory,
    sortBy,
    selectedMaterials,
    selectedConstructions,
    selectedCores,
    selectedSections,
    selectedVoltages,
  ]);

  function toggleArrayFilter(setter, value) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  function updateParams(nextValues) {
    const params = new URLSearchParams(searchParams);

    const nextSearch =
      nextValues.search !== undefined ? nextValues.search : search;
    const nextCategory =
      nextValues.category !== undefined
        ? nextValues.category
        : selectedCategory;
    const nextSort = nextValues.sort !== undefined ? nextValues.sort : sortBy;

    if (nextSearch.trim()) {
      params.set('search', nextSearch);
    } else {
      params.delete('search');
    }

    if (nextCategory && nextCategory !== 'Все') {
      params.set('category', nextCategory);
    } else {
      params.delete('category');
    }

    if (nextSort && nextSort !== 'default') {
      params.set('sort', nextSort);
    } else {
      params.delete('sort');
    }

    setSearchParams(params);
  }

  const baseProducts = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    let result = [...products];

    if (selectedCategory !== 'Все') {
      result = result.filter(
        (product) =>
          product.catalogCategory === selectedCategory ||
          product.category === selectedCategory
      );
    }

    if (normalizedSearch) {
      result = result.filter((product) => {
        return (
          product.title.toLowerCase().includes(normalizedSearch) ||
          product.sku.toLowerCase().includes(normalizedSearch) ||
          product.catalogCategory.toLowerCase().includes(normalizedSearch) ||
          product.category.toLowerCase().includes(normalizedSearch) ||
          product.mark.toLowerCase().includes(normalizedSearch) ||
          product.fullName.toLowerCase().includes(normalizedSearch)
        );
      });
    }

    return result;
  }, [products, search, selectedCategory]);

  const filterOptions = useMemo(() => {
    const materialSet = new Set();
    const constructionSet = new Set();
    const coreSet = new Set();
    const sectionSet = new Set();
    const voltageSet = new Set();

    for (const product of baseProducts) {
      materialSet.add(getConductorMaterial(product));
      constructionSet.add(getWireConstruction(product));
      const coreVariant = getCoreVariantLabel(product);
      if (coreVariant) coreSet.add(coreVariant);
      if (product.crossSection) sectionSet.add(product.crossSection);
      if (product.voltage != null) voltageSet.add(product.voltage);
    }

    return {
      materials: [...materialSet].sort((a, b) => a.localeCompare(b, 'ru')),
      constructions: [...constructionSet].sort((a, b) => a.localeCompare(b, 'ru')),
      cores: [...coreSet].sort((a, b) =>
        a.localeCompare(b, 'ru', { numeric: true })
      ),
      sections: [...sectionSet].sort((a, b) => a - b),
      voltages: [...voltageSet].sort((a, b) => a - b),
    };
  }, [baseProducts]);

  const filteredProducts = useMemo(() => {
    let result = [...baseProducts];

    if (selectedMaterials.length > 0) {
      result = result.filter((product) =>
        selectedMaterials.includes(getConductorMaterial(product))
      );
    }

    if (selectedConstructions.length > 0) {
      result = result.filter((product) =>
        selectedConstructions.includes(getWireConstruction(product))
      );
    }

    if (selectedVoltages.length > 0) {
      result = result.filter((product) =>
        selectedVoltages.includes(product.voltage)
      );
    }

    if (selectedCores.length > 0) {
      result = result.filter((product) =>
        selectedCores.includes(getCoreVariantLabel(product))
      );
    }

    if (selectedSections.length > 0) {
      result = result.filter((product) =>
        selectedSections.includes(product.crossSection)
      );
    }

    if (sortBy === 'price-asc') {
      result.sort((a, b) => a.price - b.price);
    }

    if (sortBy === 'price-desc') {
      result.sort((a, b) => b.price - a.price);
    }

    if (sortBy === 'title-asc') {
      result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    }

    if (sortBy === 'popular') {
      result.sort((a, b) => b.stock - a.stock);
    }

    return result;
  }, [
    baseProducts,
    selectedMaterials,
    selectedConstructions,
    selectedCores,
    selectedSections,
    selectedVoltages,
    sortBy,
  ]);

  const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
  const visibleProducts = filteredProducts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );
  const hasActiveFilters =
    selectedMaterials.length > 0 ||
    selectedConstructions.length > 0 ||
    selectedCores.length > 0 ||
    selectedSections.length > 0 ||
    selectedVoltages.length > 0;
  const currentSectionName = useMemo(() => {
    if (selectedCategory !== 'Все') {
      const matchedSection = catalogSections.find((section) =>
        section.categories.some((cat) => cat.name === selectedCategory)
      );

      return matchedSection?.name || selectedCategory;
    }

    if (catalogSections.length === 1) {
      return catalogSections[0].name;
    }

    const visibleSections = new Set(
      baseProducts
        .map((product) => product.catalogSection)
        .filter(Boolean)
    );

    if (visibleSections.size === 1) {
      return [...visibleSections][0];
    }

    return catalogSections[0]?.name || 'Каталог продукции';
  }, [baseProducts, catalogSections, selectedCategory]);
  const pageTitle =
    selectedCategory && selectedCategory !== 'Все'
      ? selectedCategory
      : currentSectionName;

  function resetFilters() {
    setSelectedMaterials([]);
    setSelectedConstructions([]);
    setSelectedCores([]);
    setSelectedSections([]);
    setSelectedVoltages([]);
  }

  return (
    <section className="section">
      <Container>
        <div className="catalog-page">
          <div className="catalog-page__header">
            <h1 className="page-title catalog-page__title">{pageTitle}</h1>
          </div>
          <div className="catalog-layout">
            <aside className="catalog-sidebar">
              <div className="catalog-sidebar__panel catalog-sidebar__panel--categories">
                <div className="catalog-sidebar__panel-head">
                  <span className="catalog-sidebar__panel-title">Все категории</span>
                </div>

                <button
                  type="button"
                  className={`catalog-sidebar__all${selectedCategory === 'Все' ? ' catalog-sidebar__all--active' : ''}`}
                  onClick={() => updateParams({ category: 'Все' })}
                >
                  <span>Все товары</span>
                  <span className="catalog-sidebar__count">{products.length}</span>
                </button>

                {catalogSections.map((section) => (
                  <div key={section.slug || section.name} className="catalog-sidebar__section">
                    <div className="catalog-sidebar__section-title">{section.name}</div>
                    {section.categories.map((cat) => (
                      <button
                        key={cat.slug}
                        type="button"
                        className={`catalog-sidebar__item${selectedCategory === cat.name ? ' catalog-sidebar__item--active' : ''}`}
                        onClick={() => updateParams({ category: cat.name })}
                      >
                        <span>{cat.name}</span>
                        <span className="catalog-sidebar__count">{cat.count}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </aside>

            <div className="catalog-main">
              {(filterOptions.materials.length > 0 ||
                filterOptions.constructions.length > 0 ||
                filterOptions.cores.length > 0 ||
                filterOptions.sections.length > 0 ||
                filterOptions.voltages.length > 0) && (
                <div className="catalog-filter-panel">
                  <button
                    type="button"
                    className="catalog-filter-panel__head"
                    onClick={() => setIsFilterOpen((v) => !v)}
                  >
                    <span className="catalog-filter-panel__title">Подбор по параметрам</span>
                    <span className={`catalog-filter-panel__chevron${isFilterOpen ? ' catalog-filter-panel__chevron--open' : ''}`}>
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
                                className={`catalog-filter-tag${selectedMaterials.includes(mat) ? ' catalog-filter-tag--active' : ''}`}
                                onClick={() => toggleArrayFilter(setSelectedMaterials, mat)}
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
                                className={`catalog-filter-tag${selectedConstructions.includes(construction) ? ' catalog-filter-tag--active' : ''}`}
                                onClick={() => toggleArrayFilter(setSelectedConstructions, construction)}
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
                                className={`catalog-filter-tag${selectedCores.includes(core) ? ' catalog-filter-tag--active' : ''}`}
                                onClick={() => toggleArrayFilter(setSelectedCores, core)}
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
                                className={`catalog-filter-tag${selectedSections.includes(section) ? ' catalog-filter-tag--active' : ''}`}
                                onClick={() => toggleArrayFilter(setSelectedSections, section)}
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
                                className={`catalog-filter-tag${selectedVoltages.includes(v) ? ' catalog-filter-tag--active' : ''}`}
                                onClick={() => toggleArrayFilter(setSelectedVoltages, v)}
                              >
                                {formatVoltage(v)}
                              </button>
                            ))}
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
                  <div className="catalog-filter-panel__results">
                    {isLoading ? 'Загружаем...' : (
                      <>Найдено: <strong>{filteredProducts.length}</strong> товаров</>
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
                        onClick={() => {
                          setPage((p) => p - 1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        ← Назад
                      </button>

                      {getPageNumbers(page, totalPages).map((p, i) =>
                        p === '...'
                          ? <span key={`dots-${i}`} className="catalog-pagination__dots">…</span>
                          : <button
                              key={p}
                              type="button"
                              className={`catalog-pagination__page${p === page ? ' catalog-pagination__page--active' : ''}`}
                              onClick={() => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                            >
                              {p}
                            </button>
                      )}

                      <button
                        type="button"
                        className="catalog-pagination__btn"
                        disabled={page === totalPages}
                        onClick={() => {
                          setPage((p) => p + 1);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                      >
                        Вперёд →
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <div className="catalog-empty">По вашему запросу товары не найдены.</div>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
