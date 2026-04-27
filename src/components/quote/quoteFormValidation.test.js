import { describe, expect, it } from 'vitest';
import {
  MAX_QUOTE_CUSTOMER_COMMENT_LENGTH,
  MAX_QUOTE_ITEM_COMMENT_LENGTH,
  MAX_QUOTE_ITEMS,
} from '../../../lib/quoteValidation.js';
import { validateForm } from './quoteFormValidation.js';

const okForm = {
  name: 'Иван',
  phone: '+7 (900) 123-45-67',
  email: '',
  comment: '',
  preferredChannel: 'phone',
};
const okItems = [{ id: 1, title: 'ВВГ', price: 100, quantity: 1 }];

describe('validateForm', () => {
  it('валидный минимум — без ошибок', () => {
    expect(validateForm(okForm, okItems)).toEqual({});
  });

  it('пустое имя и слишком короткое имя', () => {
    expect(validateForm({ ...okForm, name: '' }, okItems).name).toBe(
      'Введите имя'
    );
    expect(validateForm({ ...okForm, name: 'A' }, okItems).name).toMatch(
      /минимум/
    );
  });

  it('требует корректный российский телефон', () => {
    expect(validateForm({ ...okForm, phone: '' }, okItems).phone).toBe(
      'Введите телефон'
    );
    expect(validateForm({ ...okForm, phone: '+7-900' }, okItems).phone).toMatch(
      /корректный/
    );
    expect(
      validateForm({ ...okForm, phone: '0000000000' }, okItems).phone
    ).toMatch(/корректный/);
    expect(
      validateForm({ ...okForm, phone: '1234567890' }, okItems).phone
    ).toMatch(/корректный/);
  });

  it('email опционален при канале phone, но валидируется по формату если задан', () => {
    expect(
      validateForm({ ...okForm, email: 'not-email' }, okItems).email
    ).toMatch(/корректный/);
    expect(
      validateForm({ ...okForm, email: 'a@b.ru' }, okItems).email
    ).toBeUndefined();
  });

  it('канал email обязывает заполнить email — граничный случай', () => {
    const errors = validateForm(
      { ...okForm, preferredChannel: 'email', email: '' },
      okItems
    );
    expect(errors.email).toMatch(/Укажите email/);
  });

  it('пустая корзина даёт errors.cart', () => {
    expect(validateForm(okForm, []).cart).toBe('Корзина пуста');
  });

  it('ограничивает число позиций и комментарии позиций', () => {
    expect(
      validateForm(
        okForm,
        Array.from({ length: MAX_QUOTE_ITEMS + 1 }, (_, index) => ({
          ...okItems[0],
          id: index + 1,
        }))
      ).cart
    ).toMatch(String(MAX_QUOTE_ITEMS));

    expect(
      validateForm(okForm, [
        {
          ...okItems[0],
          comment: 'x'.repeat(MAX_QUOTE_ITEM_COMMENT_LENGTH + 1),
        },
      ]).cart
    ).toMatch(String(MAX_QUOTE_ITEM_COMMENT_LENGTH));
  });

  it('комментарий длиннее лимита отклоняется', () => {
    const longForm = {
      ...okForm,
      comment: 'x'.repeat(MAX_QUOTE_CUSTOMER_COMMENT_LENGTH + 1),
    };
    expect(validateForm(longForm, okItems).comment).toMatch(
      String(MAX_QUOTE_CUSTOMER_COMMENT_LENGTH)
    );
  });
});
