import { describe, expect, it } from 'vitest';
import { MAX_QUOTE_ITEMS, isValidQuoteRequest } from './quoteValidation.js';

const baseCustomer = {
  name: 'Иван',
  phone: '+7 (900) 123-45-67',
  email: '',
  preferredChannel: 'phone',
};

const baseItem = { id: 1, sku: 'YU-1', title: 'ВВГ 3х2.5', price: 100, quantity: 1 };

describe('isValidQuoteRequest', () => {
  it('принимает валидный payload без email', () => {
    expect(
      isValidQuoteRequest({ customer: baseCustomer, items: [baseItem] })
    ).toBe(true);
  });

  it('отклоняет пустой массив товаров и отсутствующего customer', () => {
    expect(isValidQuoteRequest({ customer: baseCustomer, items: [] })).toBe(false);
    expect(isValidQuoteRequest({ items: [baseItem] })).toBe(false);
    expect(isValidQuoteRequest({})).toBe(false);
  });

  it('режет payload с превышением MAX_QUOTE_ITEMS', () => {
    const items = Array.from({ length: MAX_QUOTE_ITEMS + 1 }, () => baseItem);
    expect(isValidQuoteRequest({ customer: baseCustomer, items })).toBe(false);
  });

  it('требует минимум 10 цифр в телефоне', () => {
    const tooShort = { ...baseCustomer, phone: '+7 900' };
    expect(isValidQuoteRequest({ customer: tooShort, items: [baseItem] })).toBe(false);
  });

  it('отклоняет невалидный email, если он указан', () => {
    const bad = { ...baseCustomer, email: 'not-an-email' };
    expect(isValidQuoteRequest({ customer: bad, items: [baseItem] })).toBe(false);
  });

  it('требует email, если канал связи выбран email', () => {
    const noEmail = { ...baseCustomer, preferredChannel: 'email' };
    expect(isValidQuoteRequest({ customer: noEmail, items: [baseItem] })).toBe(false);

    const withEmail = { ...noEmail, email: 'a@b.ru' };
    expect(isValidQuoteRequest({ customer: withEmail, items: [baseItem] })).toBe(true);
  });
});
