// Клиентская валидация формы КП. Возвращает { fieldName: 'сообщение' }.
// Серверный аналог (boolean) — lib/quoteValidation.js. Правила должны
// совпадать; раз в спринт стоит сверять оба теста.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizePhone(phone) {
  return String(phone || '').replace(/[^\d+]/g, '');
}

export function validateForm(form, items) {
  const errors = {};

  const name = String(form?.name || '').trim();
  const phone = normalizePhone(String(form?.phone || '').trim());
  const email = String(form?.email || '').trim();
  const comment = String(form?.comment || '').trim();
  const preferredChannel = form?.preferredChannel;

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

  // Email опционален. Проверяем формат только если поле заполнено,
  // либо если клиент сам выбрал email как канал связи.
  if (email) {
    if (!EMAIL_RE.test(email)) {
      errors.email = 'Введите корректный email';
    }
  } else if (preferredChannel === 'email') {
    errors.email = 'Укажите email — выбран как способ связи';
  }

  if (comment.length > 1000) {
    errors.comment = 'Комментарий не должен превышать 1000 символов';
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.cart = 'Корзина пуста';
  }

  return errors;
}
