import { describe, expect, it } from 'vitest';
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
    expect(validateForm({ ...okForm, name: '' }, okItems).name).toBe('Введите имя');
    expect(validateForm({ ...okForm, name: 'A' }, okItems).name).toMatch(/минимум/);
  });

  it('требует валидный телефон (≥10 цифр)', () => {
    expect(validateForm({ ...okForm, phone: '' }, okItems).phone).toBe('Введите телефон');
    expect(validateForm({ ...okForm, phone: '+7-900' }, okItems).phone).toMatch(/корректный/);
  });

  it('email опционален при канале phone, но валидируется по формату если задан', () => {
    expect(validateForm({ ...okForm, email: 'not-email' }, okItems).email).toMatch(/корректный/);
    expect(validateForm({ ...okForm, email: 'a@b.ru' }, okItems).email).toBeUndefined();
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

  it('комментарий длиннее 1000 символов отклоняется', () => {
    const longForm = { ...okForm, comment: 'x'.repeat(1001) };
    expect(validateForm(longForm, okItems).comment).toMatch(/1000/);
  });
});
