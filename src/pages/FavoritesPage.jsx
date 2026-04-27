import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import { useCartStore } from '../store/useCartStore';
import { useFavoritesStore } from '../store/useFavoritesStore';
import { useSEO } from '../hooks/useSEO';
import '../styles/sections/commerce.css';

export default function FavoritesPage() {
  useSEO({
    title: 'Избранное',
    description:
      'Сохранённые товары из каталога кабельно-проводниковой продукции ЮжУралЭлектроКабель.',
  });
  const addItem = useCartStore((state) => state.addItem);
  const { items, removeItem, clearFavorites } = useFavoritesStore();
  const [quantities, setQuantities] = useState({});

  function changeQuantity(id, nextValue) {
    setQuantities((prev) => ({
      ...prev,
      [id]: Math.max(1, nextValue),
    }));
  }

  function getQuantity(id) {
    return quantities[id] || 1;
  }

  return (
    <section className="section">
      <Container>
        <div className="favorites-head">
          <h1 className="page-title">Избранное</h1>

          {items.length > 0 ? (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                if (
                  window.confirm(
                    'Очистить избранное? Все товары будут удалены из списка.'
                  )
                ) {
                  clearFavorites();
                }
              }}
            >
              Очистить избранное
            </button>
          ) : null}
        </div>

        {items.length === 0 ? (
          <div className="favorites-empty">
            <p className="page-subtitle">
              Вы пока не добавили товары в избранное.
            </p>

            <Link to="/catalog" className="button-primary">
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <div className="favorites-grid">
            {items.map((item) => {
              const quantity = getQuantity(item.id);
              const specs = Object.entries(item.specs || {}).slice(0, 4);
              const isInStock = item.inStock ?? Number(item.stock || 0) > 0;

              return (
                <article key={item.id} className="favorite-card">
                  <div className="favorite-card__top">
                    <span className="favorite-card__badge">
                      SKU: {item.sku}
                    </span>
                    <span
                      className={`favorite-card__stock ${
                        isInStock
                          ? 'favorite-card__stock--in'
                          : 'favorite-card__stock--out'
                      }`}
                    >
                      {isInStock ? 'В наличии' : 'Под заказ'}
                    </span>
                  </div>

                  <Link
                    to={`/product/${item.slug}`}
                    className="favorite-card__image-link"
                  >
                    <img
                      src={item.image}
                      alt={item.title}
                      className="favorite-card__image"
                      width="560"
                      height="320"
                      loading="lazy"
                      decoding="async"
                    />
                  </Link>

                  <div className="favorite-card__body">
                    <div className="favorite-card__category">
                      {item.category}
                    </div>

                    <h2 className="favorite-card__title">
                      <Link to={`/product/${item.slug}`}>{item.title}</Link>
                    </h2>

                    <div className="favorite-card__specs">
                      {specs.map(([key, value]) => (
                        <div key={key} className="favorite-card__spec-row">
                          <span>{key}</span>
                          <strong>{value}</strong>
                        </div>
                      ))}
                    </div>

                    <div className="favorite-card__price-block">
                      <div className="favorite-card__price-note">
                        {item.unit}
                      </div>
                      <div className="favorite-card__price">
                        {item.price.toLocaleString('ru-RU')} ₽
                      </div>
                    </div>

                    <div className="favorite-card__controls">
                      <div className="favorite-card__qty">
                        <button
                          type="button"
                          onClick={() => changeQuantity(item.id, quantity - 1)}
                        >
                          −
                        </button>

                        <input
                          type="number"
                          min="1"
                          value={quantity}
                          onChange={(event) =>
                            changeQuantity(
                              item.id,
                              Number(event.target.value) || 1
                            )
                          }
                        />

                        <button
                          type="button"
                          onClick={() => changeQuantity(item.id, quantity + 1)}
                        >
                          +
                        </button>
                      </div>

                      <div className="favorite-card__actions">
                        <button
                          type="button"
                          className="favorite-card__icon-button"
                          onClick={() => removeItem(item.id)}
                          aria-label="Удалить из избранного"
                          title="Удалить из избранного"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                          </svg>
                        </button>

                        <Link
                          to={`/product/${item.slug}`}
                          className="favorite-card__icon-link"
                          aria-label="Открыть товар"
                          title="Открыть страницу товара"
                        >
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </Link>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="favorite-card__cart-button"
                      onClick={() => addItem({ ...item, quantity })}
                    >
                      В корзину
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </Container>
    </section>
  );
}
