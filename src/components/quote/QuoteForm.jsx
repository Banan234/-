import { useEffect, useState } from 'react';
import { useCartStore } from '../../store/useCartStore';
import {
  loadStoredJson,
  removeStoredValue,
  saveStoredJson,
} from '../../lib/browserStorage';

const FORM_STORAGE_KEY = 'yuzhural-quote-form';

const initialForm = {
  name: '',
  phone: '',
  email: '',
  comment: '',
};

function loadFormFromStorage() {
  const parsedForm = loadStoredJson(FORM_STORAGE_KEY, initialForm);

  return {
    name: parsedForm?.name || '',
    phone: parsedForm?.phone || '',
    email: parsedForm?.email || '',
    comment: parsedForm?.comment || '',
  };
}

function saveFormToStorage(form) {
  saveStoredJson(FORM_STORAGE_KEY, form);
}

function clearFormStorage() {
  removeStoredValue(FORM_STORAGE_KEY);
}

function normalizePhone(phone) {
  return phone.replace(/[^\d+]/g, '');
}

function validateForm(form, items) {
  const errors = {};

  const name = form.name.trim();
  const phone = normalizePhone(form.phone.trim());
  const email = form.email.trim();
  const comment = form.comment.trim();

  if (!name) {
    errors.name = 'Введите имя';
  } else if (name.length < 2) {
    errors.name = 'Имя должно содержать минимум 2 символа';
  }

  if (!phone) {
    errors.phone = 'Введите телефон';
  } else {
    const digitsOnly = phone.replace(/\D/g, '');
    if (digitsOnly.length < 10) {
      errors.phone = 'Введите корректный телефон';
    }
  }

  if (!email) {
    errors.email = 'Введите email';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Введите корректный email';
  }

  if (comment.length > 1000) {
    errors.comment = 'Комментарий не должен превышать 1000 символов';
  }

  if (items.length === 0) {
    errors.cart = 'Корзина пуста';
  }

  return errors;
}

export default function QuoteForm({
  title = 'Запрос коммерческого предложения',
}) {
  const { items, clearCart } = useCartStore();

  const [form, setForm] = useState(loadFormFromStorage);
  const [errors, setErrors] = useState({});
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverMessage, setServerMessage] = useState('');

  const totalCount = items.reduce((sum, item) => sum + item.quantity, 0);
  const totalPrice = items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  useEffect(() => {
    saveFormToStorage(form);
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
      })),
      totalCount,
      totalPrice,
      createdAt: new Date().toLocaleString('ru-RU'),
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

      setIsSubmitted(true);
      setServerMessage(result.message || 'Заявка успешно отправлена');
      setErrors({});
      setForm(initialForm);
      clearFormStorage();
      clearCart();
    } catch (error) {
      console.error(error);
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
        <p className="page-subtitle">
          Заполните форму, и мы подготовим предложение по текущему составу
          корзины.
        </p>
      </div>

      {items.length === 0 && !isSubmitted ? (
        <div className="form-error">
          Корзина пуста. Добавьте товары из <a href="/catalog" style={{ color: 'inherit', fontWeight: 700 }}>каталога</a>, чтобы сформировать запрос КП.
        </div>
      ) : null}

      {errors.cart ? <div className="form-error">{errors.cart}</div> : null}

      {isSubmitted ? <div className="form-success">{serverMessage}</div> : null}

      {!isSubmitted && serverMessage ? (
        <div className="form-error">{serverMessage}</div>
      ) : null}

      <form className="quote-form" onSubmit={handleSubmit}>
        <div className="quote-form__grid">
          <div className="quote-field">
            <label htmlFor="name">Имя *</label>
            <input
              id="name"
              name="name"
              type="text"
              value={form.name}
              onChange={handleChange}
              placeholder="Иван Иванов"
            />
            {errors.name ? (
              <span className="field-error">{errors.name}</span>
            ) : null}
          </div>

          <div className="quote-field">
            <label htmlFor="phone">Телефон *</label>
            <input
              id="phone"
              name="phone"
              type="text"
              value={form.phone}
              onChange={handleChange}
              placeholder="+7 (900) 000-00-00"
            />
            {errors.phone ? (
              <span className="field-error">{errors.phone}</span>
            ) : null}
          </div>

          <div className="quote-field">
            <label htmlFor="email">Email *</label>
            <input
              id="email"
              name="email"
              type="email"
              value={form.email}
              onChange={handleChange}
              placeholder="mail@company.ru"
            />
            {errors.email ? (
              <span className="field-error">{errors.email}</span>
            ) : null}
          </div>

          <div className="quote-field quote-field--full">
            <label htmlFor="comment">Комментарий</label>
            <textarea
              id="comment"
              name="comment"
              value={form.comment}
              onChange={handleChange}
              placeholder="Уточнения по объему, срокам, доставке, реквизитам"
              rows="5"
              maxLength={1000}
            />

            <div className="field-meta">
              {errors.comment ? (
                <span className="field-error">{errors.comment}</span>
              ) : (
                <span />
              )}

              <span className="char-counter">{form.comment.length} / 1000</span>
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
