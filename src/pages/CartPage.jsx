import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import { useCartStore } from '../store/useCartStore';
import { useSEO } from '../hooks/useSEO';

export default function CartPage() {
  useSEO({
    title: 'Корзина',
    description:
      'Корзина заказа кабельно-проводниковой продукции. Оформите запрос коммерческого предложения.',
  });
  const { items, addItem, decreaseItem, removeItem, clearCart } =
    useCartStore();

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  return (
    <section className="section">
      <Container>
        <h1 className="page-title">Корзина</h1>

        {items.length === 0 ? (
          <div className="cart-empty">
            <p className="page-subtitle">Корзина пока пуста.</p>
            <Link to="/catalog" className="button-primary">
              Перейти в каталог
            </Link>
          </div>
        ) : (
          <>
            <div className="cart-list">
              {items.map((item) => (
                <article key={item.id} className="cart-item">
                  <img
                    src={item.image}
                    alt={item.title}
                    className="cart-item__image"
                  />

                  <div className="cart-item__content">
                    <div className="cart-item__meta">
                      <div className="cart-item__sku">SKU: {item.sku}</div>
                      <div className="cart-item__category">{item.category}</div>
                    </div>

                    <h2 className="cart-item__title">
                      <Link
                        to={`/product/${item.slug}`}
                        className="cart-item__title-link"
                      >
                        {item.title}
                      </Link>
                    </h2>

                    <div className="cart-item__price">
                      {item.price.toLocaleString('ru-RU')} ₽
                    </div>

                    <div className="cart-item__actions">
                      <button
                        type="button"
                        onClick={() => decreaseItem(item.id)}
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button type="button" onClick={() => addItem(item)}>
                        +
                      </button>

                      <button type="button" onClick={() => removeItem(item.id)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="cart-summary">
              <div className="cart-summary__counts">
                <span>Товаров: {totalCount}</span>
                <span className="cart-summary__total">
                  Итого: <strong>{totalPrice.toLocaleString('ru-RU')} ₽</strong>
                </span>
              </div>

              <div className="cart-summary__actions">
                <button
                  type="button"
                  className="button-primary cart-summary__quote"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('open-quote-modal'))
                  }
                >
                  Запросить коммерческое предложение
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    if (window.confirm('Очистить корзину? Все товары будут удалены.')) {
                      clearCart();
                    }
                  }}
                >
                  Очистить корзину
                </button>
              </div>
            </div>
          </>
        )}
      </Container>
    </section>
  );
}
