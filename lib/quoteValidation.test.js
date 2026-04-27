import { describe, expect, it } from 'vitest';
import {
  MAX_QUOTE_CUSTOMER_COMMENT_LENGTH,
  MAX_QUOTE_ITEM_COMMENT_LENGTH,
  MAX_QUOTE_ITEMS,
  MAX_QUOTE_PAYLOAD_BYTES,
  MAX_QUOTE_TOTAL_TEXT_LENGTH,
  getQuoteKnownTextLength,
  getQuotePayloadSizeBytes,
  isValidQuoteRequest,
  isValidRussianPhone,
} from './quoteValidation.js';

const baseCustomer = {
  name: 'Иван',
  phone: '+7 (900) 123-45-67',
  email: '',
  preferredChannel: 'phone',
};

const baseItem = {
  id: 1,
  sku: 'YU-1',
  title: 'ВВГ 3х2.5',
  price: 100,
  quantity: 1,
};

describe('isValidQuoteRequest', () => {
  it('принимает валидный payload без email', () => {
    expect(
      isValidQuoteRequest({ customer: baseCustomer, items: [baseItem] })
    ).toBe(true);
  });

  it('отклоняет пустой массив товаров и отсутствующего customer', () => {
    expect(isValidQuoteRequest({ customer: baseCustomer, items: [] })).toBe(
      false
    );
    expect(isValidQuoteRequest({ items: [baseItem] })).toBe(false);
    expect(isValidQuoteRequest({})).toBe(false);
  });

  it('режет payload с превышением MAX_QUOTE_ITEMS', () => {
    const items = Array.from({ length: MAX_QUOTE_ITEMS + 1 }, () => baseItem);
    expect(isValidQuoteRequest({ customer: baseCustomer, items })).toBe(false);
  });

  it('режет payload с превышением MAX_QUOTE_PAYLOAD_BYTES', () => {
    const payload = {
      customer: baseCustomer,
      items: [baseItem],
      extra: 'x'.repeat(MAX_QUOTE_PAYLOAD_BYTES),
    };

    expect(getQuotePayloadSizeBytes(payload)).toBeGreaterThan(
      MAX_QUOTE_PAYLOAD_BYTES
    );
    expect(isValidQuoteRequest(payload)).toBe(false);
  });

  it('ограничивает комментарий клиента и комментарии позиций', () => {
    expect(
      isValidQuoteRequest({
        customer: {
          ...baseCustomer,
          comment: 'x'.repeat(MAX_QUOTE_CUSTOMER_COMMENT_LENGTH + 1),
        },
        items: [baseItem],
      })
    ).toBe(false);

    expect(
      isValidQuoteRequest({
        customer: baseCustomer,
        items: [
          {
            ...baseItem,
            comment: 'x'.repeat(MAX_QUOTE_ITEM_COMMENT_LENGTH + 1),
          },
        ],
      })
    ).toBe(false);
  });

  it('ограничивает суммарный текст заявки даже при допустимом числе позиций', () => {
    const items = Array.from({ length: 200 }, (_, index) => ({
      ...baseItem,
      id: index + 1,
      title: 'Кабель '.repeat(35),
      category: 'Категория '.repeat(12),
      comment: 'Комментарий '.repeat(40),
    }));
    const payload = { customer: baseCustomer, items };

    expect(items.length).toBeLessThanOrEqual(MAX_QUOTE_ITEMS);
    expect(getQuoteKnownTextLength(payload)).toBeGreaterThan(
      MAX_QUOTE_TOTAL_TEXT_LENGTH
    );
    expect(isValidQuoteRequest(payload)).toBe(false);
  });

  it('требует корректный российский телефон', () => {
    const tooShort = { ...baseCustomer, phone: '+7 900' };
    expect(isValidQuoteRequest({ customer: tooShort, items: [baseItem] })).toBe(
      false
    );

    for (const phone of ['0000000000', '1234567890', '+7 999 999-99-99']) {
      expect(
        isValidQuoteRequest({
          customer: { ...baseCustomer, phone },
          items: [baseItem],
        })
      ).toBe(false);
    }
  });

  it('отклоняет невалидный email, если он указан', () => {
    const bad = { ...baseCustomer, email: 'not-an-email' };
    expect(isValidQuoteRequest({ customer: bad, items: [baseItem] })).toBe(
      false
    );
  });

  it('отклоняет email с TLD < 2 символов (a@b.c)', () => {
    const bad = { ...baseCustomer, email: 'a@b.c' };
    expect(isValidQuoteRequest({ customer: bad, items: [baseItem] })).toBe(
      false
    );
  });

  it('отклоняет email длиннее 254 символов (RFC 5321)', () => {
    const long = 'a'.repeat(60) + '@' + 'b'.repeat(180) + '.com'; // 245+
    const tooLong = `${long}.${'x'.repeat(20)}`; // > 254
    const bad = { ...baseCustomer, email: tooLong };
    expect(isValidQuoteRequest({ customer: bad, items: [baseItem] })).toBe(
      false
    );
  });

  it('отклоняет email с local part > 64 символов', () => {
    const bad = { ...baseCustomer, email: 'a'.repeat(65) + '@example.com' };
    expect(isValidQuoteRequest({ customer: bad, items: [baseItem] })).toBe(
      false
    );
  });

  it('требует email, если канал связи выбран email', () => {
    const noEmail = { ...baseCustomer, preferredChannel: 'email' };
    expect(isValidQuoteRequest({ customer: noEmail, items: [baseItem] })).toBe(
      false
    );

    const withEmail = { ...noEmail, email: 'a@b.ru' };
    expect(
      isValidQuoteRequest({ customer: withEmail, items: [baseItem] })
    ).toBe(true);
  });
});

describe('isValidRussianPhone', () => {
  it('принимает мобильные и городские российские номера', () => {
    expect(isValidRussianPhone('+7 (900) 123-45-67')).toBe(true);
    expect(isValidRussianPhone('8 (351) 555-35-52')).toBe(true);
    expect(isValidRussianPhone('9001234567')).toBe(true);
  });

  it('отклоняет короткие, повторяющиеся и последовательные номера', () => {
    expect(isValidRussianPhone('+7 900')).toBe(false);
    expect(isValidRussianPhone('0000000000')).toBe(false);
    expect(isValidRussianPhone('1234567890')).toBe(false);
    expect(isValidRussianPhone('+7 999 999-99-99')).toBe(false);
  });
});
