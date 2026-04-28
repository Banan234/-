import { describe, expect, it } from 'vitest';
import { formatMessage, getMessages, messages } from './messages.js';

describe('messages', () => {
  it('подставляет значения в шаблоны сообщений', () => {
    expect(
      formatMessage(messages.errors.quoteForm.tooManyItems, { max: 200 })
    ).toBe('В заявке не должно быть больше 200 позиций');
  });

  it('возвращает ru-словарь как fallback для неизвестной локали', () => {
    expect(getMessages('en')).toBe(messages);
  });
});
