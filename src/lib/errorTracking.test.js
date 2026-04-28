import { describe, expect, it } from 'vitest';
import {
  redactSentryString,
  sanitizeSentryEvent,
  sanitizeSentryValue,
} from './errorTracking.js';

describe('errorTracking Sentry sanitizers', () => {
  it('отрезает query-string у request.url', () => {
    const event = sanitizeSentryEvent({
      request: {
        url: 'https://yuzhuralelectrokabel.ru/cart?email=ivan@example.com&phone=%2B79001234567',
      },
    });

    expect(event.request.url).toBe('https://yuzhuralelectrokabel.ru/cart');
  });

  it('редактирует email и телефон в breadcrumbs data', () => {
    const event = sanitizeSentryEvent({
      breadcrumbs: [
        {
          category: 'fetch',
          message: 'quote submit',
          data: {
            email: 'ivan@example.com',
            phone: '+7 (900) 123-45-67',
            nested: {
              phoneNumber: '89001234567',
              comment:
                'Перезвонить +7 900 123-45-67 или написать ivan@example.com',
              url: 'https://yuzhuralelectrokabel.ru/api/quote?phone=79001234567',
            },
          },
        },
      ],
    });
    const data = event.breadcrumbs[0].data;

    expect(data.email).toBe('[redacted]');
    expect(data.phone).toBe('[redacted]');
    expect(data.nested.phoneNumber).toBe('[redacted]');
    expect(data.nested.comment).toBe(
      'Перезвонить [redacted] или написать [redacted]'
    );
    expect(data.nested.url).toBe(
      'https://yuzhuralelectrokabel.ru/api/quote?phone=[redacted]'
    );
  });

  it('редактирует чувствительные ключи в extra/contexts', () => {
    const sanitized = sanitizeSentryValue({
      extra: {
        customerEmail: 'buyer@example.com',
        contactPhone: '+7 900 123-45-67',
        headers: {
          Authorization: 'Bearer secret',
        },
        source: 'QuoteForm.submit',
      },
    });

    expect(sanitized.extra.customerEmail).toBe('[redacted]');
    expect(sanitized.extra.contactPhone).toBe('[redacted]');
    expect(sanitized.extra.headers.Authorization).toBe('[redacted]');
    expect(sanitized.extra.source).toBe('QuoteForm.submit');
  });

  it('редактирует PII внутри обычных строк', () => {
    expect(redactSentryString('client=ivan@example.com&tel=+79001234567')).toBe(
      'client=[redacted]&tel=[redacted]'
    );
  });
});
