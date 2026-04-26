// Серверная валидация payload заявки. Шарится между server.js и тестами.
// Зеркальная клиентская проверка живёт в src/components/quote/quoteFormValidation.js
// — синхронизировать правила удобнее, когда оба места ссылаются на один источник.

export const MAX_QUOTE_ITEMS = 200;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidQuoteRequest({ customer, items } = {}) {
  if (!customer || !Array.isArray(items) || items.length === 0) {
    return false;
  }

  if (items.length > MAX_QUOTE_ITEMS) {
    return false;
  }

  const phoneDigits = String(customer.phone || '').replace(/\D/g, '');
  if (phoneDigits.length < 10) {
    return false;
  }

  // Email опционален. Но если он есть — должен быть валидным.
  const email = String(customer.email || '').trim();
  if (email && !EMAIL_RE.test(email)) {
    return false;
  }

  // Если клиент выбрал email как канал связи — он обязан быть.
  if (customer.preferredChannel === 'email' && !email) {
    return false;
  }

  return true;
}
