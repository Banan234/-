import { Fragment, useEffect, useMemo, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductListingView from '../components/catalog/ProductListingView';
import { fetchProducts } from '../lib/productsApi';
import { useSEO } from '../hooks/useSEO';
import catalogCategoriesData from '../../data/catalogCategories.json';
import '../styles/sections/commerce.css';

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
    title: category ? `${category.name} — купить оптом в Челябинске` : 'Каталог',
    description: category
      ? `Купить ${category.name.toLowerCase()} оптом. Актуальный прайс и наличие на складе в Челябинске. ЮжУралЭлектроКабель.`
      : '',
  });

  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadProducts() {
      try {
        setIsLoading(true);
        setError('');
        // Сервер фильтрует по catalogCategorySlug — в браузер летит только
        // нужная категория, а не весь каталог (~6700 товаров).
        const result = await fetchProducts(controller.signal, { category: slug });
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
  }, [slug]);

  const baseProducts = useMemo(() => {
    if (!category) return [];
    return products.filter(
      (p) => p.catalogCategory === category.name || p.category === category.name
    );
  }, [products, category]);

  if (!category) return null;

  const parentCategory = parentByChildSlug[slug] || null;
  const hasSubcategories =
    Array.isArray(category.subcategories) && category.subcategories.length > 0;

  return (
    <section className="section">
      <Container>
        <div className="catalog-page">
          <nav className="breadcrumbs" aria-label="Хлебные крошки">
            <Link to="/">Главная</Link>
            <span aria-hidden="true"> / </span>
            <Link to="/catalog">Каталог</Link>
            {parentCategory && (
              <>
                <span aria-hidden="true"> / </span>
                <Link to={`/catalog/${parentCategory.slug}`}>{parentCategory.name}</Link>
              </>
            )}
            <span aria-hidden="true"> / </span>
            <span aria-current="page">{category.name}</span>
          </nav>
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
                          className={`catalog-sidebar__item${
                            cat.slug === slug ? ' catalog-sidebar__item--active' : ''
                          }`}
                          style={{ textDecoration: 'none' }}
                          aria-current={cat.slug === slug ? 'page' : undefined}
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
                                sub.slug === slug ? ' catalog-sidebar__item--active' : ''
                              }`}
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
              {hasSubcategories ? (
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
              ) : (
                <ProductListingView
                  products={baseProducts}
                  isLoading={isLoading}
                  error={error}
                  scopeKey={slug}
                  extraFilters={{ showAppType: true, showSPE: true }}
                />
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
