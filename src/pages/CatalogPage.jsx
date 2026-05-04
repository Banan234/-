import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductListingView from '../components/catalog/ProductListingView';
import { fetchProducts } from '../lib/productsApi';
import { captureException } from '../lib/errorTracking';
import { useSEO } from '../hooks/useSEO';
import { useCatalogFilters } from '../hooks/useCatalogFilters';
import { usePrerenderData } from '../lib/prerenderData';
import { messages } from '../../shared/messages.js';
import catalogCategoriesData from '../../shared/catalogCategories.json';
import '../styles/sections/catalog.css';

const CATALOG_PAGE_SIZE = 24;
const CATEGORY_ROUTE_FILTERS = { showAppType: true, showSPE: true };
const CATALOG_PRERENDER_FILTER_KEYS = [
  'search',
  'priceMin',
  'priceMax',
  'material',
  'construction',
  'cores',
  'section',
  'voltage',
];

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

function getPositiveQueryNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function scheduleCatalogRevalidate(callback) {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestIdleCallback === 'function'
  ) {
    const idleId = window.requestIdleCallback(callback, { timeout: 3000 });
    return () => window.cancelIdleCallback?.(idleId);
  }

  const timeoutId = setTimeout(callback, 1200);
  return () => clearTimeout(timeoutId);
}

export function doesCatalogPrerenderDataMatchQuery({
  activeCategoryParam,
  prerenderData,
  productQueryOptions = {},
}) {
  if (!prerenderData || prerenderData.path !== '/catalog') return false;
  if (activeCategoryParam) return false;

  const prerenderPagination = prerenderData.meta?.pagination || {};
  const currentPage = getPositiveQueryNumber(productQueryOptions.page, 1);
  const prerenderPage = getPositiveQueryNumber(prerenderPagination.page, 1);
  if (currentPage !== prerenderPage) return false;

  const currentLimit = getPositiveQueryNumber(
    productQueryOptions.limit,
    CATALOG_PAGE_SIZE
  );
  const prerenderLimit = getPositiveQueryNumber(
    prerenderPagination.limit,
    CATALOG_PAGE_SIZE
  );
  if (currentLimit !== prerenderLimit) return false;

  if (productQueryOptions.sort && productQueryOptions.sort !== 'default') {
    return false;
  }

  return CATALOG_PRERENDER_FILTER_KEYS.every(
    (key) => !productQueryOptions[key]
  );
}

export default function CatalogPage() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const isCategoryRoute = Boolean(slug);
  const prerenderData = usePrerenderData();
  const catalogPrerenderData =
    !isCategoryRoute && prerenderData.catalog?.path === '/catalog'
      ? prerenderData.catalog
      : null;
  const { filters, productQueryOptions, searchQuery, updateParam } =
    useCatalogFilters({
      limit: CATALOG_PAGE_SIZE,
      includeAdvancedFilters: isCategoryRoute,
    });
  const routeCategory = isCategoryRoute ? categoryBySlug[slug] : null;
  const parentCategory = isCategoryRoute
    ? parentByChildSlug[slug] || null
    : null;
  const hasSubcategories =
    Boolean(routeCategory) &&
    Array.isArray(routeCategory.subcategories) &&
    routeCategory.subcategories.length > 0;
  const activeCategoryParam = isCategoryRoute ? slug : filters.category;
  const hasMatchingPrerenderData = doesCatalogPrerenderDataMatchQuery({
    activeCategoryParam,
    prerenderData: catalogPrerenderData,
    productQueryOptions,
  });

  const [products, setProducts] = useState(
    () => catalogPrerenderData?.items || []
  );
  const [catalogSections, setCatalogSections] = useState(
    () => catalogPrerenderData?.catalogSections || []
  );
  const [productsMeta, setProductsMeta] = useState(
    () => catalogPrerenderData?.meta || {}
  );
  const [isLoading, setIsLoading] = useState(() => !catalogPrerenderData);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isCategoryRoute && !routeCategory) {
      navigate('/', { replace: true });
    }
  }, [isCategoryRoute, navigate, routeCategory]);

  useEffect(() => {
    if (isCategoryRoute && !routeCategory) {
      return undefined;
    }

    const controller = new AbortController();
    async function loadProducts({ showLoading = true, showError = true } = {}) {
      try {
        if (showLoading) {
          setIsLoading(true);
        }
        setError('');

        const result = await fetchProducts(controller.signal, {
          ...productQueryOptions,
          category: activeCategoryParam,
        });
        setProducts(result.items);
        setCatalogSections(result.meta?.catalogSections || []);
        setProductsMeta(result.meta || {});
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        captureException(requestError, { source: 'CatalogPage.loadProducts' });
        if (showError) {
          setError(
            requestError.message || messages.errors.productApi.catalogLoadFailed
          );
        }
      } finally {
        if (showLoading) {
          setIsLoading(false);
        }
      }
    }

    if (hasMatchingPrerenderData) {
      setProducts(catalogPrerenderData.items || []);
      setCatalogSections(catalogPrerenderData.catalogSections || []);
      setProductsMeta(catalogPrerenderData.meta || {});
      setIsLoading(false);
      setError('');

      const cancelRevalidate = scheduleCatalogRevalidate(() =>
        loadProducts({ showLoading: false, showError: false })
      );
      return () => {
        cancelRevalidate();
        controller.abort();
      };
    }

    loadProducts();

    return () => controller.abort();
  }, [
    activeCategoryParam,
    catalogPrerenderData,
    hasMatchingPrerenderData,
    isCategoryRoute,
    productQueryOptions,
    routeCategory,
    searchQuery,
  ]);

  function setCategory(slug) {
    updateParam('category', slug);
  }

  const activeCategory = useMemo(() => {
    if (routeCategory) return routeCategory;
    if (!activeCategoryParam) return null;
    for (const section of catalogSections) {
      const match = section.categories.find(
        (cat) =>
          cat.slug === activeCategoryParam || cat.name === activeCategoryParam
      );
      if (match) return match;
    }
    return null;
  }, [activeCategoryParam, catalogSections, routeCategory]);

  const pageTitle = activeCategory ? activeCategory.name : 'Каталог продукции';
  const visibleCount =
    productsMeta.pagination?.total ?? productsMeta.total ?? products.length;
  const catalogCount = productsMeta.catalogCount ?? products.length;

  useSEO({
    title: isCategoryRoute
      ? activeCategory
        ? `${activeCategory.name} — купить оптом в Челябинске`
        : 'Каталог'
      : activeCategory
        ? `Каталог: ${activeCategory.name}`
        : 'Каталог продукции',
    description: activeCategory
      ? `Купить ${activeCategory.name.toLowerCase()} оптом. Актуальный прайс и наличие на складе в Челябинске. ЮжУралЭлектроКабель.`
      : 'Каталог кабельной и некабельной продукции. Кабель, провод, арматура и электрооборудование в наличии и под заказ.',
  });

  if (isCategoryRoute && !routeCategory) return null;

  return (
    <section
      className={
        isCategoryRoute
          ? 'section'
          : 'section section--dark-soft catalog-section'
      }
    >
      <Container>
        <div className="catalog-page">
          {isCategoryRoute ? (
            <>
              <nav className="breadcrumbs" aria-label="Хлебные крошки">
                <Link to="/">Главная</Link>
                <span aria-hidden="true"> / </span>
                <Link to="/catalog">Каталог</Link>
                {parentCategory && (
                  <>
                    <span aria-hidden="true"> / </span>
                    <Link to={`/catalog/${parentCategory.slug}`}>
                      {parentCategory.name}
                    </Link>
                  </>
                )}
                <span aria-hidden="true"> / </span>
                <span aria-current="page">{activeCategory.name}</span>
              </nav>
              <div className="catalog-page__header">
                <h1 className="page-title catalog-page__title">
                  {activeCategory.name}
                </h1>
              </div>
            </>
          ) : (
            <div className="catalog-page__header">
              <span className="catalog-page__eyebrow">Каталог продукции</span>
              <h1 className="page-title catalog-page__title">{pageTitle}</h1>
              <p className="catalog-page__subtitle">
                {isLoading ? (
                  'Загружаем актуальные позиции из прайса...'
                ) : (
                  <>
                    В наличии{' '}
                    <strong>{visibleCount.toLocaleString('ru-RU')}</strong>{' '}
                    позиций · Отгрузка со склада в Челябинске
                  </>
                )}
              </p>
            </div>
          )}

          <div className="catalog-layout">
            {isCategoryRoute ? (
              <aside className="catalog-sidebar">
                <div
                  className="catalog-sidebar__panel"
                  style={{ padding: 0, overflow: 'hidden' }}
                >
                  {catalogCategoriesData.sections.map((section) =>
                    section.categories.map((cat) => {
                      const subs = cat.subcategories || [];
                      const isExpanded =
                        cat.slug === slug ||
                        subs.some((sub) => sub.slug === slug);

                      return (
                        <Fragment key={cat.slug}>
                          <Link
                            to={`/catalog/${cat.slug}`}
                            className={`catalog-sidebar__item${
                              cat.slug === slug
                                ? ' catalog-sidebar__item--active'
                                : ''
                            }`}
                            style={{ textDecoration: 'none' }}
                            aria-current={
                              cat.slug === slug ? 'page' : undefined
                            }
                          >
                            <span>{cat.name}</span>
                            <span className="catalog-sidebar__count">›</span>
                          </Link>
                          {isExpanded &&
                            subs.map((sub) => (
                              <Link
                                key={sub.slug}
                                to={`/catalog/${sub.slug}`}
                                className={`catalog-sidebar__item catalog-sidebar__item--sub${
                                  sub.slug === slug
                                    ? ' catalog-sidebar__item--active'
                                    : ''
                                }`}
                                style={{ textDecoration: 'none' }}
                                aria-current={
                                  sub.slug === slug ? 'page' : undefined
                                }
                              >
                                <span>{sub.name}</span>
                                <span className="catalog-sidebar__count">
                                  ›
                                </span>
                              </Link>
                            ))}
                        </Fragment>
                      );
                    })
                  )}
                </div>
              </aside>
            ) : (
              <aside className="catalog-sidebar">
                <div className="catalog-sidebar__panel catalog-sidebar__panel--categories">
                  <div className="catalog-sidebar__panel-head">
                    <span className="catalog-sidebar__panel-title">
                      Все категории
                    </span>
                  </div>

                  <button
                    type="button"
                    className={`catalog-sidebar__all${
                      !activeCategoryParam
                        ? ' catalog-sidebar__all--active'
                        : ''
                    }`}
                    onClick={() => setCategory('')}
                  >
                    <span>Все товары</span>
                    <span className="catalog-sidebar__count">
                      {catalogCount}
                    </span>
                  </button>

                  {catalogSections.map((section) => (
                    <div
                      key={section.slug || section.name}
                      className="catalog-sidebar__section"
                    >
                      <div className="catalog-sidebar__section-title">
                        {section.name}
                      </div>
                      {section.categories.map((cat) => (
                        <button
                          key={cat.slug}
                          type="button"
                          className={`catalog-sidebar__item${
                            activeCategoryParam === cat.slug ||
                            activeCategoryParam === cat.name
                              ? ' catalog-sidebar__item--active'
                              : ''
                          }`}
                          onClick={() => setCategory(cat.slug)}
                        >
                          <span>{cat.name}</span>
                          <span className="catalog-sidebar__count">
                            {cat.count}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </aside>
            )}

            <div className="catalog-main">
              {isCategoryRoute && hasSubcategories ? (
                <div className="subcategories-grid">
                  {activeCategory.subcategories.map((sub) => (
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
              ) : (
                <ProductListingView
                  products={products}
                  isLoading={isLoading}
                  error={error}
                  scopeKey={activeCategoryParam || 'all'}
                  extraFilters={
                    isCategoryRoute ? CATEGORY_ROUTE_FILTERS : undefined
                  }
                  pagination={productsMeta.pagination}
                  filterOptions={productsMeta.facets}
                />
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
