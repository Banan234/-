import { useState } from 'react';
import { Link } from 'react-router-dom';
import Container from '../components/ui/Container';
import { useCartStore } from '../store/useCartStore';
import { useSEO } from '../hooks/useSEO';
import { trackEvent } from '../lib/analytics';
import '../styles/sections/commerce.css';

const initialManualItem = {
  mark: '',
  quantity: '',
  unit: 'м',
  comment: '',
};

function formatNumber(value) {
  return Number(value || 0).toLocaleString('ru-RU');
}

export default function CartPage() {
  useSEO({
    title: 'Список для КП',
    description:
      'Список кабельно-проводниковой продукции для запроса коммерческого предложения.',
  });
  const { items, addManualItem, updateItemQuantity, removeItem, clearCart } =
    useCartStore();
  const [manualItem, setManualItem] = useState(initialManualItem);
  const [manualError, setManualError] = useState('');
  const [isPdfBuilding, setIsPdfBuilding] = useState(false);
  const [pdfError, setPdfError] = useState('');

  async function handleDownloadPdf() {
    if (items.length === 0) return;
    setPdfError('');
    setIsPdfBuilding(true);
    try {
      const { generateQuotePdf } = await import('../lib/quotePdf.js');
      await generateQuotePdf({ items });
      const total = items.reduce(
        (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
        0
      );
      trackEvent('price-download', {
        items: items.length,
        total: Math.round(total),
        format: 'pdf',
        source: 'cart',
      });
    } catch (error) {
      console.error(error);
      setPdfError(error.message || 'Не удалось сформировать PDF');
    } finally {
      setIsPdfBuilding(false);
    }
  }

  const positionsCount = items.length;
  const totalLength = items.reduce((sum, item) => {
    if ((item.unit || '').toLowerCase() !== 'м') {
      return sum;
    }

    return sum + Number(item.quantity || 0);
  }, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  function handleManualChange(event) {
    const { name, value } = event.target;

    setManualItem((prev) => ({
      ...prev,
      [name]: value,
    }));
    setManualError('');
  }

  function handleManualSubmit(event) {
    event.preventDefault();

    const mark = manualItem.mark.trim();
    const quantity = Number(manualItem.quantity);

    if (!mark) {
      setManualError('Укажите марку или наименование позиции');
      return;
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      setManualError('Укажите метраж или объём');
      return;
    }

    addManualItem({
      title: mark,
      name: mark,
      fullName: mark,
      mark,
      shortDescription: manualItem.comment.trim() || 'Позиция добавлена вручную для запроса КП.',
      quantity,
      unit: manualItem.unit,
      comment: manualItem.comment.trim(),
    });
    setManualItem(initialManualItem);
  }

  return (
    <section className="section">
      <Container>
        <div className="cart-page__head">
          <div>
            <h1 className="page-title">Список для КП</h1>
            <p className="page-subtitle">
              Соберите позиции, укажите метраж и отправьте список на расчёт.
              Это не оформление оплаты.
            </p>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="cart-empty">
            <p className="page-subtitle">Список пока пуст.</p>
            <Link to="/catalog" className="button-primary">
              Перейти в каталог
            </Link>
          </div>
        ) : null}

        <div className="cart-manual">
          <div className="cart-manual__head">
            <h2 className="cart-manual__title">Добавить позицию вручную</h2>
            <p className="cart-manual__text">
              Для срочной заявки: введите марку или описание кабеля, даже если позиции нет в каталоге.
            </p>
          </div>

          <form className="cart-manual__form" onSubmit={handleManualSubmit}>
            <label className="cart-manual__field cart-manual__field--mark">
              <span>Марка или наименование</span>
              <input
                name="mark"
                value={manualItem.mark}
                onChange={handleManualChange}
                placeholder="Например: ВВГнг-LS 3×2.5"
              />
            </label>

            <label className="cart-manual__field">
              <span>Метраж</span>
              <input
                name="quantity"
                type="number"
                min="0"
                step="0.01"
                value={manualItem.quantity}
                onChange={handleManualChange}
                placeholder="500"
              />
            </label>

            <label className="cart-manual__field">
              <span>Ед.</span>
              <select name="unit" value={manualItem.unit} onChange={handleManualChange}>
                <option value="м">м</option>
                <option value="шт">шт</option>
                <option value="кг">кг</option>
                <option value="бухта">бухта</option>
              </select>
            </label>

            <label className="cart-manual__field cart-manual__field--comment">
              <span>Комментарий</span>
              <input
                name="comment"
                value={manualItem.comment}
                onChange={handleManualChange}
                placeholder="Например: нужен аналог, срочно"
              />
            </label>

            <button type="submit" className="button-secondary cart-manual__submit">
              Добавить в список
            </button>
          </form>

          {manualError ? <div className="field-error">{manualError}</div> : null}
        </div>

        {items.length > 0 ? (
          <>
            <div className="cart-list">
              {items.map((item) => {
                const quantity = Number(item.quantity || 0);
                const unit = item.unit || 'м';
                const lineTotal = Number(item.price || 0) * quantity;

                return (
                <article key={item.id} className="cart-item">
                  <img
                    src={item.image || '/product-placeholder.svg'}
                    alt={item.title}
                    className="cart-item__image"
                  />

                  <div className="cart-item__content">
                    <div className="cart-item__meta">
                      {item.sku ? <div className="cart-item__sku">SKU: {item.sku}</div> : null}
                      <div className="cart-item__category">{item.category}</div>
                    </div>

                    <h2 className="cart-item__title">
                      {item.slug ? (
                        <Link
                          to={`/product/${item.slug}`}
                          className="cart-item__title-link"
                        >
                          {item.title}
                        </Link>
                      ) : (
                        <span>{item.title}</span>
                      )}
                    </h2>

                    {item.shortDescription ? (
                      <p className="cart-item__description">{item.shortDescription}</p>
                    ) : null}

                    <div className="cart-item__price-row">
                      <div className="cart-item__price">
                        {Number(item.price || 0) > 0
                          ? `${Number(item.price).toLocaleString('ru-RU')} ₽ / ${unit}`
                          : 'Цена будет рассчитана в КП'}
                      </div>
                      {lineTotal > 0 ? (
                        <div className="cart-item__line-total">
                          Предварительно: {lineTotal.toLocaleString('ru-RU')} ₽
                        </div>
                      ) : null}
                    </div>

                    <div className="cart-item__actions">
                      <label className="cart-item__quantity">
                        <span>Метраж</span>
                        <div className="cart-item__quantity-control">
                          <input
                            key={`${item.id}-${quantity}`}
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={quantity}
                            onBlur={(event) =>
                              updateItemQuantity(item.id, event.target.value)
                            }
                          />
                          <strong>{unit}</strong>
                        </div>
                      </label>

                      <button type="button" onClick={() => removeItem(item.id)}>
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
                );
              })}
            </div>

            <div className="cart-summary">
              <div className="cart-summary__counts">
                <span>Позиций: {formatNumber(positionsCount)}</span>
                <span>Общая длина: {formatNumber(totalLength)} м</span>
                <span className="cart-summary__total">
                  Предварительная сумма:{' '}
                  <strong>{totalPrice.toLocaleString('ru-RU')} ₽</strong>
                </span>
              </div>
              <p className="cart-summary__note">
                Сумма справочная, без скидки объёма и без учёта ручных позиций.
                Итоговые цены фиксируем в коммерческом предложении.
              </p>

              <div className="cart-summary__actions">
                <button
                  type="button"
                  className="button-primary cart-summary__quote"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('open-cart-quote-modal'))
                  }
                >
                  Запросить коммерческое предложение
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={handleDownloadPdf}
                  disabled={isPdfBuilding}
                  title="Сформировать КП на бланке и сохранить в PDF"
                >
                  {isPdfBuilding ? 'Формируем PDF...' : '↓ Скачать КП в PDF'}
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    if (window.confirm('Очистить список для КП? Все позиции будут удалены.')) {
                      clearCart();
                    }
                  }}
                >
                  Очистить корзину
                </button>
              </div>

              {pdfError ? <div className="field-error">{pdfError}</div> : null}
            </div>
          </>
        ) : null}
      </Container>
    </section>
  );
}
