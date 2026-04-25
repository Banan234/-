import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Container from '../components/ui/Container';
import ProductCard from '../components/ui/ProductCard';
import { fetchProductBySlug, fetchRelatedProducts } from '../lib/productsApi';
import { useCartStore } from '../store/useCartStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { useSEO } from '../hooks/useSEO';
import { useJsonLd } from '../hooks/useJsonLd';
import { trackEvent } from '../lib/analytics';
import {
  SITE_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from '../lib/siteConfig';
import '../styles/sections/commerce.css';

const BREADCRUMB_JSON_LD_ID = 'product-breadcrumb-json-ld';
const PRODUCT_JSON_LD_ID = 'product-product-json-ld';

function buildProductJsonLd(product) {
  if (!product) return null;

  const url = absoluteUrl(`/product/${product.slug}`);
  const price = Number(product.price);
  const hasPrice = Number.isFinite(price) && price > 0;
  const stock = Number(product.stock);
  const hasStock = Number.isFinite(stock) && stock > 0;
  const brandName =
    product.catalogBrand || product.manufacturer || SITE_LEGAL_NAME;

  const data = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.title || product.fullName || product.name,
    sku: product.sku || String(product.id),
    url,
    description:
      product.description ||
      [
        product.fullName || product.name,
        product.catalogCategory,
        product.catalogSection,
      ]
        .filter(Boolean)
        .join(' · '),
    brand: {
      '@type': 'Brand',
      name: brandName,
    },
    category: product.catalogCategory || product.catalogSection || undefined,
  };

  if (product.image) {
    data.image = absoluteUrl(product.image);
  }

  if (product.mark) {
    data.mpn = product.mark;
  }

  if (hasPrice) {
    data.offers = {
      '@type': 'Offer',
      url,
      priceCurrency: 'RUB',
      price: price.toFixed(2),
      availability: hasStock
        ? 'https://schema.org/InStock'
        : 'https://schema.org/PreOrder',
      itemCondition: 'https://schema.org/NewCondition',
      seller: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: SITE_URL,
      },
    };
  }

  return data;
}

function getCatalogPath(slug) {
  return slug ? `/catalog/${slug}` : '/catalog';
}

function getProductBreadcrumbs(product) {
  const items = [
    { label: 'Главная', to: '/' },
    { label: 'Каталог', to: '/catalog' },
  ];
  const hasSection = Boolean(product.catalogSection);
  const hasCategory = Boolean(product.catalogCategory);
  const isSameCatalogLevel =
    (product.catalogSectionSlug &&
      product.catalogSectionSlug === product.catalogCategorySlug) ||
    product.catalogSection === product.catalogCategory;

  if (hasSection) {
    items.push({
      label: product.catalogSection,
      to: getCatalogPath(product.catalogSectionSlug),
    });
  }

  if (hasCategory && !isSameCatalogLevel) {
    items.push({
      label: product.catalogCategory,
      to: getCatalogPath(product.catalogCategorySlug),
    });
  }

  items.push({
    label: product.title,
    to: `/product/${product.slug}`,
    isCurrent: true,
  });

  return items;
}

function getAbsoluteUrl(path) {
  return absoluteUrl(path);
}

export default function ProductPage() {
  const { slug } = useParams();
  const addItem = useCartStore((state) => state.addItem);
  const toggleFavorite = useFavoritesStore((state) => state.toggleItem);
  const [quantity, setQuantity] = useState(1);
  const [product, setProduct] = useState(null);
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const isFavorite = useFavoritesStore((state) =>
    state.isFavorite(product?.id)
  );

  useSEO({
    title: product ? product.title : undefined,
    description: product ? product.description : '',
    ogType: 'product',
    image: product?.image,
    canonical: product ? `/product/${product.slug}` : undefined,
  });

  useEffect(() => {
    const controller = new AbortController();
    setQuantity(1);

    async function load() {
      try {
        setIsLoading(true);
        setError('');

        const [item, related] = await Promise.all([
          fetchProductBySlug(slug, controller.signal),
          fetchRelatedProducts(slug, 6, controller.signal),
        ]);

        setProduct(item);
        setRelatedProducts(related);
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

        console.error(requestError);
        setError(requestError.message || 'Не удалось загрузить товар');
      } finally {
        setIsLoading(false);
      }
    }

    load();

    return () => controller.abort();
  }, [slug]);

  const breadcrumbJsonLd = product
    ? {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: getProductBreadcrumbs(product).map((item, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          name: item.label,
          item: getAbsoluteUrl(item.to),
        })),
      }
    : null;

  const productJsonLd = product ? buildProductJsonLd(product) : null;

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
          <h1 className="page-title">Товар не найден</h1>
          <p className="page-subtitle">
            {error ||
              'Возможно, ссылка устарела или товар был удален из каталога.'}
          </p>
          <Link to="/catalog" className="button-primary">
            Вернуться в каталог
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

  return (
    <section className="section">
      <Container>
        <nav className="breadcrumbs" aria-label="Хлебные крошки">
          {getProductBreadcrumbs(product).map((item, index, items) => (
            <span key={`${item.label}-${index}`}>
              {index > 0 && <span aria-hidden="true"> / </span>}
              {index === items.length - 1 ? (
                <span aria-current="page">{item.label}</span>
              ) : (
                <Link to={item.to}>{item.label}</Link>
              )}
            </span>
          ))}
        </nav>

        <div className="product-page">
          <div className="product-page__media">
            <img
              src={product.image}
              alt={product.title}
              className="product-page__image"
            />
          </div>

          <div className="product-page__content">
            <div className="product-page__category">{product.category}</div>
            <h1 className="page-title">{product.title}</h1>

            <div className="product-page__meta">
              <div>SKU: {product.sku}</div>
              <div>Производитель: {product.manufacturer}</div>
            </div>

            <p className="page-subtitle">{product.description}</p>

            <div className="product-page__status-row">
              <span
                className={
                  product.inStock
                    ? 'product-page__status product-page__status--in-stock'
                    : 'product-page__status product-page__status--out'
                }
              >
                {product.inStock ? 'В наличии' : 'Под заказ'}
              </span>

              <span className="product-page__lead-time">
                Срок поставки: {product.leadTime}
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

                <input
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
