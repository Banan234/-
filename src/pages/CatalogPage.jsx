import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductListingView from '../components/catalog/ProductListingView';
import { fetchProducts } from '../lib/productsApi';
import { useSEO } from '../hooks/useSEO';
import '../styles/sections/commerce.css';

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

  function setCategory(name) {
    const params = new URLSearchParams(searchParams);
    if (name && name !== 'Все') {
      params.set('category', name);
    } else {
      params.delete('category');
    }
    setSearchParams(params);
  }

  const baseProducts = useMemo(() => {
    if (activeCategory === 'Все') return products;
    return products.filter(
      (product) =>
        product.catalogCategory === activeCategory ||
        product.category === activeCategory
    );
  }, [products, activeCategory]);

  const currentSectionName = useMemo(() => {
    if (activeCategory !== 'Все') {
      const matchedSection = catalogSections.find((section) =>
        section.categories.some((cat) => cat.name === activeCategory)
      );
      return matchedSection?.name || activeCategory;
    }

    if (catalogSections.length === 1) {
      return catalogSections[0].name;
    }

    return catalogSections[0]?.name || 'Каталог продукции';
  }, [catalogSections, activeCategory]);

  const pageTitle =
    activeCategory && activeCategory !== 'Все' ? activeCategory : currentSectionName;

  return (
    <section className="section section--dark-soft catalog-section">
      <Container>
        <div className="catalog-page">
          <div className="catalog-page__header">
            <span className="catalog-page__eyebrow">Каталог продукции</span>
            <h1 className="page-title catalog-page__title">{pageTitle}</h1>
            <p className="catalog-page__subtitle">
              {isLoading ? (
                'Загружаем актуальные позиции из прайса...'
              ) : (
                <>
                  В наличии <strong>{baseProducts.length.toLocaleString('ru-RU')}</strong>{' '}
                  позиций · Отгрузка со склада в Челябинске
                </>
              )}
            </p>
          </div>
          <div className="catalog-layout">
            <aside className="catalog-sidebar">
              <div className="catalog-sidebar__panel catalog-sidebar__panel--categories">
                <div className="catalog-sidebar__panel-head">
                  <span className="catalog-sidebar__panel-title">Все категории</span>
                </div>

                <button
                  type="button"
                  className={`catalog-sidebar__all${
                    activeCategory === 'Все' ? ' catalog-sidebar__all--active' : ''
                  }`}
                  onClick={() => setCategory('Все')}
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
                        className={`catalog-sidebar__item${
                          activeCategory === cat.name ? ' catalog-sidebar__item--active' : ''
                        }`}
                        onClick={() => setCategory(cat.name)}
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
              <ProductListingView
                products={baseProducts}
                isLoading={isLoading}
                error={error}
                scopeKey={activeCategory}
              />
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
