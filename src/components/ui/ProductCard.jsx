import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCartStore } from '../../store/useCartStore';
import { useFavoritesStore } from '../../store/useFavoritesStore';
import {
  CardActions,
  CardPrice,
  ProductBadges,
  ProductMeta,
  ProductSummary,
  ProductTitle,
} from './ProductCardParts';
import '../../styles/sections/product-card.css';

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
  const isInStock = product.inStock ?? product.stock > 0;
  const statusLabel = isInStock ? 'В наличии' : 'Под заказ';
  const shippingLabel = isInStock
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
  const brand = product.brand || product.manufacturer || product.catalogBrand;
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
          subtitle:
            'Оставьте телефон — уточним наличие и подготовим предложение по позиции.',
          submitLabel: 'Получить КП',
          comment: `Интересует ${displayTitle}${product.sku ? `, SKU: ${product.sku}` : ''}`,
          source: 'Карточка товара',
        },
      })
    );
  }

  function handleAddToCart() {
    const wasAdded = addItem(product);
    if (!wasAdded) return;
    setAddedToCart(true);
    setTimeout(() => setAddedToCart(false), 1500);
  }

  function handleToggleFavorite() {
    toggleFavorite(product);
  }

  return (
    <article
      className={`product-card${isStockVariant ? ' product-card--stock' : ''}`}
    >
      <Link to={productUrl} className="product-card__image-link">
        {!isStockVariant && <ProductBadges badges={badges} />}
        <img
          src={product.image}
          alt={product.title}
          className="product-card__image"
          width="560"
          height="320"
          loading="lazy"
          decoding="async"
        />
      </Link>

      <div className="product-card__body">
        {!isStockVariant && (
          <ProductMeta
            brand={brand}
            product={product}
            isInStock={isInStock}
            statusLabel={statusLabel}
          />
        )}

        <ProductTitle productUrl={productUrl} title={displayTitle} />
        <ProductSummary
          isStockVariant={isStockVariant}
          stockSubtitle={stockSubtitle}
          catalogStockLabel={catalogStockLabel}
          shippingLabel={shippingLabel}
          description={product.shortDescription}
        />
        <CardPrice
          isStockVariant={isStockVariant}
          priceValue={priceValue}
          priceUnitLabel={priceUnitLabel}
        />
        <CardActions
          isStockVariant={isStockVariant}
          addedToCart={addedToCart}
          isFavorite={isFavorite}
          onAddToCart={handleAddToCart}
          onOpenQuote={handleOpenQuote}
          onToggleFavorite={handleToggleFavorite}
        />
      </div>
    </article>
  );
}
