import { useEffect, useId, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductCard from '../components/ui/ProductCard';
import { fetchProductBySlug, fetchRelatedProducts } from '../lib/productsApi';
import { useCartStore } from '../store/useCartStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { useSEO } from '../hooks/useSEO';
import { useJsonLd } from '../hooks/useJsonLd';
import { trackEvent } from '../lib/analytics';
import { captureException } from '../lib/errorTracking';
import { usePrerenderData } from '../lib/prerenderData';
import {
  buildProductBreadcrumbJsonLd,
  buildProductJsonLd,
  buildProductMetaDescription,
  getProductBreadcrumbs,
} from '../lib/productSeo';
import { messages } from '../../shared/messages.js';
import '../styles/sections/product-detail.css';

const BREADCRUMB_JSON_LD_ID = 'product-breadcrumb-json-ld';
const PRODUCT_JSON_LD_ID = 'product-product-json-ld';

function getProductDisplayTitle(product) {
  return (
    product?.title || product?.fullName || product?.name || product?.mark || ''
  );
}

export default function ProductPage() {
  const { slug } = useParams();
  const prerenderData = usePrerenderData();
  const initialProduct =
    prerenderData.product && prerenderData.product.slug === slug
      ? prerenderData.product
      : null;
  const addItem = useCartStore((state) => state.addItem);
  const toggleFavorite = useFavoritesStore((state) => state.toggleItem);
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState(() => initialProduct);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(() => !initialProduct);
  const [error, setError] = useState('');
  const quantityInputId = useId();
  const isFavorite = useFavoritesStore((state) =>
    state.isFavorite(product?.id)
  );

  useSEO({
    title: product ? getProductDisplayTitle(product) : undefined,
    description: product
      ? product.description || buildProductMetaDescription(product)
      : '',
    ogType: 'product',
    image: product?.image,
    canonical: product ? `/product/${product.slug}` : undefined,
  });

  useEffect(() => {
    const controller = new AbortController();
    setQuantity(1);
    setRelatedProducts([]);

    if (initialProduct) {
      setProduct(initialProduct);
      setIsLoading(false);
      setError('');

      fetchRelatedProducts(slug, 6, controller.signal)
        .then(setRelatedProducts)
        .catch((requestError) => {
          if (requestError.name === 'AbortError') return;
          captureException(requestError, {
            source: 'ProductPage.loadRelatedProducts',
            slug: typeof slug === 'string' ? slug : undefined,
          });
          setRelatedProducts([]);
        });

      return () => controller.abort();
    }

    setProduct(null);

    async function load() {
      try {
        setIsLoading(true);
        setError('');

        const item = await fetchProductBySlug(slug, controller.signal);

        setProduct(item);
        if (item) {
          trackEvent('product-view', {
            sku: item.sku || item.id,
            slug: item.slug,
            mark: item.mark,
            category: item.catalogCategorySlug || item.catalogSectionSlug,
          });
        }
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        captureException(requestError, {
          source: 'ProductPage.loadProduct',
          slug: typeof slug === 'string' ? slug : undefined,
        });
        setError(
          requestError.message || messages.errors.productApi.productLoadFailed
        );
        setIsLoading(false);
        return;
      }

      setIsLoading(false);

      try {
        const related = await fetchRelatedProducts(slug, 6, controller.signal);
        setRelatedProducts(related);
      } catch (requestError) {
        if (requestError.name === 'AbortError') {
          return;
        }

        captureException(requestError, {
          source: 'ProductPage.loadRelatedProducts',
          slug: typeof slug === 'string' ? slug : undefined,
        });
        setRelatedProducts([]);
      }
    }

    load();

    return () => controller.abort();
  }, [initialProduct, slug]);

  const breadcrumbJsonLd = buildProductBreadcrumbJsonLd(product);
  const productJsonLd = buildProductJsonLd(product);

  useJsonLd(BREADCRUMB_JSON_LD_ID, breadcrumbJsonLd);
  useJsonLd(PRODUCT_JSON_LD_ID, productJsonLd);

  if (isLoading) {
    return (
      <section className="section">
        <Container>
          <h1 className="page-title">Загружаем товар</h1>
          <p className="page-subtitle">
            Проверяем актуальные данные из прайса.
          </p>
        </Container>
      </section>
    );
  }

  if (!product) {
    return (
      <section className="section">
        <Container>
          <h1 className="page-title">
            {messages.errors.productApi.productNotFound}
          </h1>
          <p className="page-subtitle">
            {error || messages.errors.productApi.productNotFoundDescription}
          </p>
          <Link to="/catalog" className="button-primary">
            {messages.text.backToCatalog}
          </Link>
        </Container>
      </section>
    );
  }

  function openProductQuoteModal() {
    window.dispatchEvent(
      new CustomEvent('open-cart-quote-modal', {
        detail: {
          title: 'Запрос КП по этой позиции',
          description:
            'Заполните форму, и мы подготовим коммерческое предложение по выбранной позиции.',
          items: [{ ...product, quantity }],
        },
      })
    );
  }

  const manufacturerName = String(product.manufacturer || '').trim();
  const productTitle = getProductDisplayTitle(product);
  const productDescription =
    product.description || buildProductMetaDescription(product);
  const productImage = product.image || '/product-placeholder.svg';
  const isProductInStock =
    typeof product.inStock === 'boolean'
      ? product.inStock
      : Number(product.stock) > 0;
  const leadTime = product.leadTime || 'уточняем';

  return (
    <section className="section">
      <Container>
        <nav
          className="breadcrumbs"
          role="navigation"
          aria-label="Хлебные крошки"
        >
          <ol
            className="breadcrumbs__list"
            itemScope
            itemType="https://schema.org/BreadcrumbList"
          >
            {getProductBreadcrumbs(product).map((item, index, items) => {
              const isLast = index === items.length - 1;
              const position = index + 1;
              return (
                <li
                  key={`${item.label}-${index}`}
                  className="breadcrumbs__item"
                  itemProp="itemListElement"
                  itemScope
                  itemType="https://schema.org/ListItem"
                >
                  {index > 0 && (
                    <span className="breadcrumbs__sep" aria-hidden="true">
                      {' / '}
                    </span>
                  )}
                  {isLast ? (
                    <span aria-current="page" itemProp="name">
                      {item.label}
                    </span>
                  ) : (
                    <Link to={item.to} itemProp="item">
                      <span itemProp="name">{item.label}</span>
                    </Link>
                  )}
                  <meta itemProp="position" content={String(position)} />
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="product-page">
          <div className="product-page__media">
            <img
              src={productImage}
              alt={productTitle}
              className="product-page__image"
              width="560"
              height="320"
              loading="eager"
              decoding="async"
            />
          </div>

          <div className="product-page__content">
            <div className="product-page__category">{product.category}</div>
            <h1 className="page-title">{productTitle}</h1>

            <div className="product-page__meta">
              <div>SKU: {product.sku}</div>
              {manufacturerName ? (
                <div>Производитель: {manufacturerName}</div>
              ) : null}
            </div>

            <p className="page-subtitle">{productDescription}</p>

            <div className="product-page__status-row">
              <span
                className={
                  isProductInStock
                    ? 'product-page__status product-page__status--in-stock'
                    : 'product-page__status product-page__status--out'
                }
              >
                {isProductInStock ? 'В наличии' : 'Под заказ'}
              </span>

              <span className="product-page__lead-time">
                Срок поставки: {leadTime}
              </span>
            </div>

            <div className="product-page__price">
              {product.price.toLocaleString('ru-RU')} ₽
            </div>

            <div className="product-page__unit">
              {product.unit ? `/ ${product.unit}` : ''}
            </div>

            <div className="product-page__buttons">
              <div className="product-qty">
                <button
                  type="button"
                  onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                >
                  −
                </button>

                <label className="visually-hidden" htmlFor={quantityInputId}>
                  Количество товара
                </label>
                <input
                  id={quantityInputId}
                  type="number"
                  value={quantity}
                  min="1"
                  onChange={(event) =>
                    setQuantity(Math.max(1, Number(event.target.value) || 1))
                  }
                />

                <button type="button" onClick={() => setQuantity((q) => q + 1)}>
                  +
                </button>
              </div>

              <button
                type="button"
                className="button-primary"
                onClick={openProductQuoteModal}
              >
                Запросить КП по этой позиции
              </button>

              <button
                type="button"
                className="button-secondary"
                onClick={() => addItem({ ...product, quantity })}
              >
                Добавить в корзину
              </button>

              <button
                type="button"
                className="button-secondary"
                onClick={() => toggleFavorite(product)}
              >
                {isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              </button>

              <Link to="/cart" className="button-secondary">
                Перейти в корзину
              </Link>
            </div>
          </div>
        </div>

        {product.specs && Object.keys(product.specs).length > 0 && (
          <div className="product-details">
            <div className="product-details__card">
              <h2 className="section-title section-title--left">
                Технические характеристики
              </h2>

              <table className="product-specs-table">
                <tbody>
                  {Object.entries(product.specs).map(([key, value]) => (
                    <tr key={key} className="product-specs-table__row">
                      <td className="product-specs-table__label">{key}</td>
                      <td className="product-specs-table__value">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {relatedProducts.length > 0 ? (
          <div className="related-products">
            <div className="section-head">
              <h2 className="section-title section-title--left">
                Похожие товары
              </h2>
            </div>

            <div className="products-grid">
              {relatedProducts.map((item) => (
                <ProductCard key={item.id} product={item} />
              ))}
            </div>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
