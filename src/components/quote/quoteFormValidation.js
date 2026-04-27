// Клиентская валидация формы КП. Возвращает { fieldName: 'сообщение' }.
import {
  MAX_QUOTE_CUSTOMER_COMMENT_LENGTH,
  MAX_QUOTE_ITEM_COMMENT_LENGTH,
  MAX_QUOTE_ITEMS,
  isValidEmail,
  isValidRussianPhone,
} from '../../../lib/quoteValidation.js';

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
  } else if (!isValidRussianPhone(phone)) {
    errors.phone = 'Введите корректный телефон';
  }

  // Email опционален. Проверяем формат только если поле заполнено,
  // либо если клиент сам выбрал email как канал связи.
  if (email) {
    if (!isValidEmail(email)) {
      errors.email = 'Введите корректный email';
    }
  } else if (preferredChannel === 'email') {
    errors.email = 'Укажите email — выбран как способ связи';
  }

  if (comment.length > MAX_QUOTE_CUSTOMER_COMMENT_LENGTH) {
    errors.comment = `Комментарий не должен превышать ${MAX_QUOTE_CUSTOMER_COMMENT_LENGTH} символов`;
  }

  if (!Array.isArray(items) || items.length === 0) {
    errors.cart = 'Корзина пуста';
  } else if (items.length > MAX_QUOTE_ITEMS) {
    errors.cart = `В заявке не должно быть больше ${MAX_QUOTE_ITEMS} позиций`;
  } else if (
    items.some(
      (item) =>
        String(item?.comment || '').trim().length >
        MAX_QUOTE_ITEM_COMMENT_LENGTH
    )
  ) {
    errors.cart = `Комментарий к позиции не должен превышать ${MAX_QUOTE_ITEM_COMMENT_LENGTH} символов`;
  }

  return errors;
}
