import { useEffect, useId, useRef, useState } from 'react';
import { useCartStore } from '../../store/useCartStore';
import { trackEvent } from '../../lib/analytics';
import { captureException } from '../../lib/errorTracking';
import HoneypotField from '../forms/HoneypotField';
import {
  loadStoredJson,
  removeStoredValue,
  saveStoredJson,
} from '../../lib/browserStorage';
import { MAX_QUOTE_CUSTOMER_COMMENT_LENGTH } from '../../../lib/quoteValidation.js';
import { validateForm } from './quoteFormValidation';

const FORM_STORAGE_KEY = 'yuzhural-quote-form';

const CHANNEL_OPTIONS = [
  { value: 'phone', label: 'Звонок' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'telegram', label: 'Telegram' },
  { value: 'email', label: 'Email' },
];

const initialForm = {
  name: '',
  phone: '',
  email: '',
  comment: '',
  preferredChannel: 'phone',
};

function loadFormFromStorage() {
  const parsedForm = loadStoredJson(FORM_STORAGE_KEY, initialForm);

  return {
    name: parsedForm?.name || '',
    phone: parsedForm?.phone || '',
    email: parsedForm?.email || '',
    comment: parsedForm?.comment || '',
    preferredChannel: parsedForm?.preferredChannel || 'phone',
  };
}

function saveFormToStorage(form) {
  saveStoredJson(FORM_STORAGE_KEY, form);
}

function clearFormStorage() {
  removeStoredValue(FORM_STORAGE_KEY);
}

export default function QuoteForm({
  title = 'Запрос коммерческого предложения',
  description = 'Заполните форму, и мы подготовим предложение по текущему составу корзины.',
  itemsOverride = null,
}) {
  const { items: cartItems, clearCart } = useCartStore();
  const items = itemsOverride || cartItems;
  const shouldClearCartOnSuccess = !itemsOverride;

  const [form, setForm] = useState(loadFormFromStorage);
  const [honeypot, setHoneypot] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState('');
  const fieldIdPrefix = useId().replace(/:/g, '');
  const renderedAtRef = useRef(Date.now());
  const fieldIds = {
    name: `${fieldIdPrefix}-quote-name`,
    phone: `${fieldIdPrefix}-quote-phone`,
    email: `${fieldIdPrefix}-quote-email`,
    comment: `${fieldIdPrefix}-quote-comment`,
  };
  const errorIds = {
    name: `${fieldIds.name}-error`,
    phone: `${fieldIds.phone}-error`,
    email: `${fieldIds.email}-error`,
    comment: `${fieldIds.comment}-error`,
  };

  const totalCount = items.length;
  const totalPrice = items.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  );

  useEffect(() => {
    const timer = setTimeout(() => saveFormToStorage(form), 300);
    return () => clearTimeout(timer);
  }, [form]);

  function handleChange(event) {
    const { name, value } = event.target;

    setForm((prev) => ({
      ...prev,
      [name]: value,
    }));

    setErrors((prev) => ({
      ...prev,
      [name]: '',
      cart: '',
    }));

    setIsSubmitted(false);
    setServerMessage('');
  }

  function handleChannelChange(value) {
    setForm((prev) => ({ ...prev, preferredChannel: value }));
    setErrors((prev) => ({ ...prev, email: '' }));
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const nextErrors = validateForm(form, items);

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      setIsSubmitted(false);
      return;
    }

    setIsSubmitting(true);
    setServerMessage('');

    const cleanedForm = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      email: form.email.trim(),
      comment: form.comment.trim(),
      preferredChannel: form.preferredChannel,
    };

    const orderPayload = {
      customer: cleanedForm,
      items: items.map((item) => ({
        id: item.id,
        sku: item.sku,
        title: item.title,
        category: item.category,
        price: item.price,
        quantity: item.quantity,
        unit: item.unit,
        comment: item.comment,
      })),
      totalCount,
      totalPrice,
      createdAt: new Date().toLocaleString('ru-RU'),
      rendered_at: renderedAtRef.current,
      submit_at: Date.now(),
      company_website: honeypot,
    };

    try {
      const response = await fetch('/api/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(orderPayload),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        throw new Error(result.message || 'Ошибка отправки');
      }

      trackEvent('quote-submit', {
        items: totalCount,
        total: Math.round(totalPrice),
        channel: cleanedForm.preferredChannel,
        hasEmail: Boolean(cleanedForm.email),
      });
      setIsSubmitted(true);
      setServerMessage(result.message || 'Заявка успешно отправлена');
      setErrors({});
      setForm(initialForm);
      renderedAtRef.current = Date.now();
      clearFormStorage();
      if (shouldClearCartOnSuccess) {
        clearCart();
      }
    } catch (error) {
      captureException(error, { source: 'QuoteForm.submit' });
      setIsSubmitted(false);
      setServerMessage(error.message || 'Не удалось отправить заявку');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="quote-form-wrap">
      <div className="quote-form-head">
        <h2 className="section-title section-title--left">{title}</h2>
        <p className="page-subtitle">{description}</p>
      </div>

      {items.length === 0 && !isSubmitted ? (
        <div className="form-error">
          Корзина пуста. Добавьте товары из{' '}
          <a href="/catalog" style={{ color: 'inherit', fontWeight: 700 }}>
            каталога
          </a>
          , чтобы сформировать запрос КП.
        </div>
      ) : null}

      {errors.cart ? <div className="form-error">{errors.cart}</div> : null}

      {isSubmitted ? <div className="form-success">{serverMessage}</div> : null}

      {!isSubmitted && serverMessage ? (
        <div className="form-error">{serverMessage}</div>
      ) : null}

      <form className="quote-form" onSubmit={handleSubmit} noValidate>
        <HoneypotField
          value={honeypot}
          onChange={(event) => setHoneypot(event.target.value)}
        />
        <div className="quote-form__grid">
          <div className="quote-field">
            <label htmlFor={fieldIds.name}>Имя *</label>
            <input
              id={fieldIds.name}
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="Иван Иванов"
              aria-invalid={errors.name ? 'true' : undefined}
              aria-describedby={errors.name ? errorIds.name : undefined}
            />
            {errors.name ? (
              <span id={errorIds.name} className="field-error">
                {errors.name}
              </span>
            ) : null}
          </div>

          <div className="quote-field">
            <label htmlFor={fieldIds.phone}>Телефон *</label>
            <input
              id={fieldIds.phone}
              name="phone"
              type="text"
              value={form.phone}
              onChange={handleChange}
              placeholder="+7 (900) 000-00-00"
              aria-invalid={errors.phone ? 'true' : undefined}
              aria-describedby={errors.phone ? errorIds.phone : undefined}
            />
            {errors.phone ? (
              <span id={errorIds.phone} className="field-error">
                {errors.phone}
              </span>
            ) : null}
          </div>

          <div className="quote-field">
            <label htmlFor={fieldIds.email}>
              Email <span className="quote-field__optional">(опционально)</span>
            </label>
            <input
              id={fieldIds.email}
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="mail@company.ru"
              aria-invalid={errors.email ? 'true' : undefined}
              aria-describedby={errors.email ? errorIds.email : undefined}
            />
            {errors.email ? (
              <span id={errorIds.email} className="field-error">
                {errors.email}
              </span>
            ) : null}
          </div>

          <div className="quote-field quote-field--full">
            <label>Как удобнее связаться?</label>
            <div className="quote-channels">
              {CHANNEL_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`quote-channel${
                    form.preferredChannel === option.value
                      ? ' quote-channel--active'
                      : ''
                  }`}
                >
                  <input
                    type="radio"
                    name="preferredChannel"
                    value={option.value}
                    checked={form.preferredChannel === option.value}
                    onChange={() => handleChannelChange(option.value)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
            <span className="quote-field__hint">
              Если выбран мессенджер — отправим КП в чат на указанный телефон.
            </span>
          </div>

          <div className="quote-field quote-field--full">
            <label htmlFor={fieldIds.comment}>Комментарий</label>
            <textarea
              id={fieldIds.comment}
              name="comment"
              value={form.comment}
              onChange={handleChange}
              placeholder="Уточнения по объему, срокам, доставке, реквизитам"
              rows="5"
              maxLength={MAX_QUOTE_CUSTOMER_COMMENT_LENGTH}
              aria-invalid={errors.comment ? 'true' : undefined}
              aria-describedby={errors.comment ? errorIds.comment : undefined}
            />

            <div className="field-meta">
              {errors.comment ? (
                <span id={errorIds.comment} className="field-error">
                  {errors.comment}
                </span>
              ) : (
                <span />
              )}

              <span className="char-counter">
                {form.comment.length} / {MAX_QUOTE_CUSTOMER_COMMENT_LENGTH}
              </span>
            </div>
          </div>
        </div>

        <button
          type="submit"
          className="button-primary"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Отправка...' : 'Отправить запрос КП'}
        </button>
      </form>
    </div>
  );
}
