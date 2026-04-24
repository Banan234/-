import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductCard from '../components/ui/ProductCard';
import { fetchProducts } from '../lib/productsApi';
import { getCoreVariantLabel, getConductorMaterial, getWireConstruction, formatVoltage } from '../lib/catalogFilters';
import { useSEO } from '../hooks/useSEO';
import catalogCategoriesData from '../../data/catalogCategories.json';

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

const categoryBySlug = {};
const parentByChildSlug = {};
for (const section of catalogCategoriesData.sections) {
  for (const cat of section.categories) {
    categoryBySlug[cat.slug] = cat;
    for (const sub of cat.subcategories || []) {
      categoryBySlug[sub.slug] = sub;
      parentByChildSlug[sub.slug] = cat;
    }
  }
}

function FilterGroup({ label, children, activeCount }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sidebar-filter-group">
      <button
        type="button"
        className="sidebar-filter-group__head"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="sidebar-filter-group__label">
          {label}
          {activeCount > 0 && (
            <span className="sidebar-filter-group__badge">{activeCount}</span>
          )}
        </span>
        <span className={`sidebar-filter-group__chevron${open ? ' sidebar-filter-group__chevron--open' : ''}`}>
          ›
        </span>
      </button>
      {open && (
        <div className="sidebar-filter-group__body">
          {children}
        </div>
      )}
    </div>
  );
}

export default function SubcategoryPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const category = categoryBySlug[slug];

  useEffect(() => {
    if (!category) {
      navigate('/', { replace: true });
    }
  }, [category, navigate]);

  useSEO({
    title: category
      ? `${category.name} — купить оптом в Челябинске`
      : 'Каталог',
    description: category
      ? `Купить ${category.name.toLowerCase()} оптом. Актуальный прайс и наличие на складе в Челябинске. ЮжУралЭлектроКабель.`
      : '',
  });

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [sortBy, setSortBy] = useState('default');
  const [selectedMaterials, setSelectedMaterials] = useState([]);
  const [selectedConstructions, setSelectedConstructions] = useState([]);
  const [selectedCores, setSelectedCores] = useState([]);
  const [selectedSections, setSelectedSections] = useState([]);
  const [selectedVoltages, setSelectedVoltages] = useState([]);
  const [selectedAppTypes, setSelectedAppTypes] = useState([]);
  const [onlySPE, setOnlySPE] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    setSelectedMaterials([]);
    setSelectedConstructions([]);
    setSelectedCores([]);
    setSelectedSections([]);
    setSelectedVoltages([]);
    setSelectedAppTypes([]);
    setOnlySPE(false);
    setSortBy('default');
    setPage(1);
  }, [slug]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        setIsLoading(true);
        setError('');
        const result = await fetchProducts(controller.signal);
        setProducts(result.items);
      } catch (requestError) {
        if (requestError.name === 'AbortError') return;
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
    setPage(1);
  }, [sortBy, selectedMaterials, selectedConstructions, selectedCores, selectedSections, selectedVoltages, selectedAppTypes, onlySPE]);

  function toggleArrayFilter(setter, value) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  const baseProducts = useMemo(() => {
    if (!category) return [];
    return products.filter(
      (p) =>
        p.catalogCategory === category.name || p.category === category.name
    );
  }, [products, category]);

  const filterOptions = useMemo(() => {
    const materialSet = new Set();
    const constructionSet = new Set();
    const coreSet = new Set();
    const sectionSet = new Set();
    const voltageSet = new Set();
    const appTypeSet = new Set();
    let hasSPE = false;

    for (const product of baseProducts) {
      materialSet.add(getConductorMaterial(product));
      constructionSet.add(getWireConstruction(product));
      const coreVariant = getCoreVariantLabel(product);
      if (coreVariant) coreSet.add(coreVariant);
      if (product.crossSection) sectionSet.add(product.crossSection);
      if (product.voltage != null) voltageSet.add(product.voltage);
      if (product.catalogApplicationType) appTypeSet.add(product.catalogApplicationType);
      if (product.catalogType === 'СПЭ') hasSPE = true;
    }

    return {
      materials: [...materialSet].sort((a, b) => a.localeCompare(b, 'ru')),
      constructions: [...constructionSet].sort((a, b) => a.localeCompare(b, 'ru')),
      cores: [...coreSet].sort((a, b) =>
        a.localeCompare(b, 'ru', { numeric: true })
      ),
      sections: [...sectionSet].sort((a, b) => a - b),
      voltages: [...voltageSet].sort((a, b) => a - b),
      appTypes: [...appTypeSet].sort((a, b) => a.localeCompare(b, 'ru')),
      hasSPE,
    };
  }, [baseProducts]);

  const filteredProducts = useMemo(() => {
    let result = [...baseProducts];

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
    if (selectedVoltages.length > 0) {
      result = result.filter((p) => selectedVoltages.includes(p.voltage));
    }
    if (selectedCores.length > 0) {
      result = result.filter((p) =>
        selectedCores.includes(getCoreVariantLabel(p))
      );
    }
    if (selectedSections.length > 0) {
      result = result.filter((p) =>
        selectedSections.includes(p.crossSection)
      );
    }
    if (selectedAppTypes.length > 0) {
      result = result.filter((p) =>
        selectedAppTypes.includes(p.catalogApplicationType)
      );
    }
    if (onlySPE) {
      result = result.filter((p) => p.catalogType === 'СПЭ');
    }

    if (sortBy === 'price-asc') result.sort((a, b) => a.price - b.price);
    if (sortBy === 'price-desc') result.sort((a, b) => b.price - a.price);
    if (sortBy === 'title-asc')
      result.sort((a, b) => a.title.localeCompare(b.title, 'ru'));
    if (sortBy === 'popular') result.sort((a, b) => b.stock - a.stock);

    return result;
  }, [baseProducts, selectedMaterials, selectedConstructions, selectedCores, selectedSections, selectedVoltages, selectedAppTypes, onlySPE, sortBy]);

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
    selectedVoltages.length > 0 ||
    selectedAppTypes.length > 0 ||
    onlySPE;

  function resetFilters() {
    setSelectedMaterials([]);
    setSelectedConstructions([]);
    setSelectedCores([]);
    setSelectedSections([]);
    setSelectedVoltages([]);
    setSelectedAppTypes([]);
    setOnlySPE(false);
  }

  const hasFilters =
    filterOptions.materials.length > 0 ||
    filterOptions.cores.length > 0 ||
    filterOptions.sections.length > 0 ||
    filterOptions.voltages.length > 0 ||
    filterOptions.appTypes.length > 0 ||
    filterOptions.hasSPE;

  if (!category) return null;

  return (
    <section className="section">
      <Container>
        <div className="catalog-page">
          <div className="catalog-page__header">
            <h1 className="page-title catalog-page__title">{category.name}</h1>
          </div>
          <div className="catalog-layout">

            {/* SIDEBAR */}
            <aside className="catalog-sidebar">
              <div className="catalog-sidebar__panel" style={{ padding: 0, overflow: 'hidden' }}>
                {catalogCategoriesData.sections.map((section) =>
                  section.categories.map((cat) => {
                    const subs = cat.subcategories || [];
                    const isExpanded = cat.slug === slug || subs.some((s) => s.slug === slug);
                    return (
                      <Fragment key={cat.slug}>
                        <Link
                          to={`/catalog/${cat.slug}`}
                          className={`catalog-sidebar__item${cat.slug === slug ? ' catalog-sidebar__item--active' : ''}`}
                          style={{ textDecoration: 'none' }}
                          aria-current={cat.slug === slug ? 'page' : undefined}
                        >
                          <span>{cat.name}</span>
                          <span className="catalog-sidebar__count">›</span>
                        </Link>
                        {isExpanded && subs.map((sub) => (
                          <Link
                            key={sub.slug}
                            to={`/catalog/${sub.slug}`}
                            className={`catalog-sidebar__item catalog-sidebar__item--sub${sub.slug === slug ? ' catalog-sidebar__item--active' : ''}`}
                            style={{ textDecoration: 'none' }}
                            aria-current={sub.slug === slug ? 'page' : undefined}
                          >
                            <span>{sub.name}</span>
                            <span className="catalog-sidebar__count">›</span>
                          </Link>
                        ))}
                      </Fragment>
                    );
                  })
                )}
              </div>
            </aside>

            {/* MAIN */}
            <div className="catalog-main">

              {category.subcategories && category.subcategories.length > 0 ? (
                <div className="subcategories-grid">
                  {category.subcategories.map((sub) => (
                    <Link
                      key={sub.slug}
                      to={`/catalog/${sub.slug}`}
                      className="subcategory-card"
                      style={{ textDecoration: 'none' }}
                    >
                      <span className="subcategory-card__name">{sub.name}</span>
                      <span className="subcategory-card__arrow">›</span>
                    </Link>
                  ))}
                </div>
              ) : null}

              {(!category.subcategories || category.subcategories.length === 0) && hasFilters && (
                <div className="catalog-filter-panel">
                  {filterOptions.materials.length > 0 && (
                    <FilterGroup label="Материал жилы" activeCount={selectedMaterials.length}>
                      <div className="sidebar-filter-tags">
                        {filterOptions.materials.map((mat) => (
                          <button
                            key={mat}
                            type="button"
                            className={`sidebar-filter-tag${selectedMaterials.includes(mat) ? ' sidebar-filter-tag--active' : ''}`}
                            onClick={() => toggleArrayFilter(setSelectedMaterials, mat)}
                          >
                            {mat}
                          </button>
                        ))}
                      </div>
                    </FilterGroup>
                  )}

                <FilterGroup label="Исполнение жилы" activeCount={selectedConstructions.length}>
                  <div className="sidebar-filter-tags">
                    {['однопроволочная', 'многопроволочная'].map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`sidebar-filter-tag${selectedConstructions.includes(c) ? ' sidebar-filter-tag--active' : ''}`}
                        onClick={() => toggleArrayFilter(setSelectedConstructions, c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </FilterGroup>

                {filterOptions.cores.length > 0 && (
                  <FilterGroup label="Количество жил" activeCount={selectedCores.length}>
                    <div className="sidebar-filter-tags">
                      {filterOptions.cores.map((core) => (
                        <button
                          key={core}
                          type="button"
                          className={`sidebar-filter-tag${selectedCores.includes(core) ? ' sidebar-filter-tag--active' : ''}`}
                          onClick={() => toggleArrayFilter(setSelectedCores, core)}
                        >
                          {core}
                        </button>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {filterOptions.sections.length > 0 && (
                  <FilterGroup label="Сечение, мм²" activeCount={selectedSections.length}>
                    <div className="sidebar-filter-tags">
                      {filterOptions.sections.map((sec) => (
                        <button
                          key={sec}
                          type="button"
                          className={`sidebar-filter-tag${selectedSections.includes(sec) ? ' sidebar-filter-tag--active' : ''}`}
                          onClick={() => toggleArrayFilter(setSelectedSections, sec)}
                        >
                          {sec.toLocaleString('ru-RU')}
                        </button>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {filterOptions.voltages.length > 0 && (
                  <FilterGroup label="Напряжение, кВ" activeCount={selectedVoltages.length}>
                    <div className="sidebar-filter-tags">
                      {filterOptions.voltages.map((v) => (
                        <button
                          key={v}
                          type="button"
                          className={`sidebar-filter-tag${selectedVoltages.includes(v) ? ' sidebar-filter-tag--active' : ''}`}
                          onClick={() => toggleArrayFilter(setSelectedVoltages, v)}
                        >
                          {formatVoltage(v)}
                        </button>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {filterOptions.appTypes.length > 0 && (
                  <FilterGroup label="Применение" activeCount={selectedAppTypes.length}>
                    <div className="sidebar-filter-tags">
                      {filterOptions.appTypes.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`sidebar-filter-tag${selectedAppTypes.includes(t) ? ' sidebar-filter-tag--active' : ''}`}
                          onClick={() => toggleArrayFilter(setSelectedAppTypes, t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </FilterGroup>
                )}

                {filterOptions.hasSPE && (
                  <FilterGroup label="Тип изоляции" activeCount={onlySPE ? 1 : 0}>
                    <div className="sidebar-filter-tags">
                      <button
                        type="button"
                        className={`sidebar-filter-tag${onlySPE ? ' sidebar-filter-tag--active' : ''}`}
                        onClick={() => setOnlySPE((v) => !v)}
                      >
                        Только СПЭ
                      </button>
                    </div>
                  </FilterGroup>
                )}

                {hasActiveFilters && (
                  <button
                    type="button"
                    className="sidebar-reset-btn"
                    onClick={resetFilters}
                  >
                    ✕ Сбросить фильтры
                  </button>
                )}
              </div>
            )}

              {(!category.subcategories || category.subcategories.length === 0) && (
                <>
                  {!error && (
                    <div className="catalog-filter-summary">
                      <div className="catalog-filter-panel__sort">
                        <label className="catalog-filter-panel__sort-label">Сортировка:</label>
                        <select
                          value={sortBy}
                          onChange={(e) => setSortBy(e.target.value)}
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
                </>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
