import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../../store/useCartStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';

function formatStockLabel(product) {
  const stockValue = product.stock.toLocaleString('ru-RU');
  return product.unit ? `${stockValue} ${product.unit}` : stockValue;
}

export default function ProductCard({ product, variant = 'default' }) {
  const addItem = useCartStore((state) => state.addItem);
  const toggleFavorite = useFavoritesStore((state) => state.toggleItem);
  const isFavorite = useFavoritesStore((state) => state.isFavorite(product.id));
  const [addedToCart, setAddedToCart] = useState(false);
  const isStockVariant = variant === 'stock';
  const productUrl = `/product/${product.slug}`;
  const stockLabel = `В наличии: ${formatStockLabel(product)}`;
  const stockSubtitle = stockLabel;
  const catalogStockLabel = stockLabel;
  const statusLabel = product.inStock ? 'В наличии' : 'Под заказ';
  const shippingLabel = product.inStock
    ? product.stock >= 100
      ? 'Отгрузка: сегодня'
      : 'Отгрузка: 1-2 дня'
    : 'Отгрузка: под заказ';
  const badges = [];

  if (!isStockVariant && product.stock >= 500) {
    badges.push('Хит');
  }

  const priceValue = `${product.price.toLocaleString('ru-RU')} ₽`;
  const priceUnitLabel = product.unit ? `/ ${product.unit}` : '';
  const brand = product.manufacturer || product.catalogBrand;
  const displayTitle = (() => {
    if (!brand) return product.title;
    const upper = product.title.toUpperCase();
    const brandUp = brand.toUpperCase();
    if (upper.startsWith(brandUp + '-') || upper.startsWith(brandUp + ' ')) {
      return product.title.slice(brand.length + 1).trim();
    }
    return product.title;
  })();

  function handleOpenQuote() {
    window.dispatchEvent(
      new CustomEvent('open-quote-modal', {
        detail: {
          title: 'Получить КП',
          subtitle: 'Оставьте телефон — уточним наличие и подготовим предложение по позиции.',
          submitLabel: 'Получить КП',
          comment: `Интересует ${displayTitle}${product.sku ? `, SKU: ${product.sku}` : ''}`,
          source: 'Карточка товара',
        },
      })
    );
  }

  function handleAddToCart() {
    addItem(product);
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 1500);
  }

  return (
    <article className={`product-card${isStockVariant ? ' product-card--stock' : ''}`}>
      <Link
        to={productUrl}
        className="product-card__image-link"
      >
        {!isStockVariant && badges.length > 0 ? (
          <div className="product-card__badges">
            {badges.map((badge) => (
              <span key={badge} className="product-card__badge">
                {badge}
              </span>
            ))}
          </div>
        ) : null}
        <img
          src={product.image}
          alt={product.title}
          className="product-card__image"
        />
      </Link>

      <div className="product-card__body">
        {isStockVariant ? null : (
          <>
            <div className="product-card__meta">
              <div
                className={`product-card__status ${
                  product.inStock
                    ? 'product-card__status--in-stock'
                    : 'product-card__status--out'
                }`}
              >
                {statusLabel}
              </div>
            </div>
            <div className="product-card__category">{product.category}</div>
            {brand && (
              <div className="product-card__manufacturer">Производитель: {brand}</div>
            )}
          </>
        )}

        <h3 className="product-card__title">
          <Link
            to={productUrl}
            className="product-card__title-link"
          >
            {displayTitle}
          </Link>
        </h3>

        {isStockVariant ? (
          <p className="product-card__subtitle">{stockSubtitle}</p>
        ) : (
          <>
            <div className="product-card__supply">
              <p className="product-card__stock-note">{catalogStockLabel}</p>
              <p className="product-card__lead-time-note">{shippingLabel}</p>
            </div>
            <p className="product-card__description">{product.shortDescription}</p>
          </>
        )}

        {isStockVariant ? (
          <div className="product-card__price-row">
            <div className="product-card__price">{priceValue}</div>
            {priceUnitLabel && (
              <div className="product-card__unit">{priceUnitLabel}</div>
            )}
          </div>
        ) : (
          <>
            <div className="product-card__price-block">
              <div className="product-card__price-label">Цена</div>
              <div className="product-card__price-row">
                <div className="product-card__price">{priceValue}</div>
                {priceUnitLabel && (
                  <div className="product-card__unit">{priceUnitLabel}</div>
                )}
              </div>
            </div>
          </>
        )}

        {isStockVariant ? (
          <>
            <div className="product-card__actions">
              <button
                className="product-card__cta"
                type="button"
                onClick={handleOpenQuote}
              >
                Получить КП
              </button>

              <button
                className={`product-card__icon-button${isFavorite ? ' product-card__icon-button--active' : ''}`}
                type="button"
                onClick={() => toggleFavorite(product)}
                aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              >
                <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>

              <button
                className={`product-card__icon-button${addedToCart ? ' product-card__icon-button--added' : ''}`}
                type="button"
                onClick={handleAddToCart}
                aria-label={addedToCart ? 'Добавлено в корзину' : 'Добавить в корзину'}
                title={addedToCart ? 'Добавлено в корзину' : 'Добавить в корзину'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9" cy="21" r="1" />
                  <circle cx="20" cy="21" r="1" />
                  <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
                </svg>
              </button>
            </div>
          </>
        ) : (
          <div className="product-card__buttons">
            <button
              className="product-card__primary-cta"
              type="button"
              onClick={handleOpenQuote}
            >
              Получить КП
            </button>

            <div className="product-card__utility-row">
              <button
                className={`product-card__secondary${
                  addedToCart ? ' product-card__secondary--added' : ''
                }`}
                type="button"
                onClick={handleAddToCart}
              >
                {addedToCart ? '✓ В корзине' : 'В корзину'}
              </button>

              <button
                className={`product-card__icon-button${isFavorite ? ' product-card__icon-button--active' : ''}`}
                type="button"
                onClick={() => toggleFavorite(product)}
                aria-label={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
                title={isFavorite ? 'Убрать из избранного' : 'Добавить в избранное'}
              >
                <svg viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
