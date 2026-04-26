import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

// Мокаем nodemailer ДО импорта server.js — чтобы createTransport вернул
// заглушку и реальные SMTP-вызовы не уходили никуда. vi.hoisted гарантирует,
// что объявление sendMail поднимется выше vi.mock.
const { sendMailMock } = vi.hoisted(() => ({
  sendMailMock: vi.fn().mockResolvedValue({ messageId: 'test-id' }),
}));

vi.mock('nodemailer', () => ({
  default: {
    createTransport: () => ({ sendMail: sendMailMock }),
  },
}));

const { createApp } = await import('./server.js');

let server;
let baseUrl;

beforeAll(async () => {
  // Высокий лимит: тестам нужно слать больше 5 запросов в минуту, иначе
  // boilerplate-проверки (415, 400 на bad payload и т.п.) уткнутся в rate limit.
  const app = createApp({ rateLimitOptions: { limit: 1000 } });
  await new Promise((resolve) => {
    server = app.listen(0, resolve);
  });
  const { port } = server.address();
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
});

beforeEach(() => {
  sendMailMock.mockClear();
});

const validPayload = {
  customer: {
    name: 'Иван',
    phone: '+7 (900) 123-45-67',
    email: 'ivan@example.com',
    comment: '',
    preferredChannel: 'phone',
  },
  items: [
    {
      id: 1,
      sku: 'YU-1',
      title: 'ВВГ 3х2.5',
      category: 'Кабель ВВГ',
      price: 100,
      quantity: 5,
      unit: 'м',
    },
  ],
  totalCount: 1,
  totalPrice: 500,
  createdAt: '2026-04-26 10:00',
};

async function postJson(path, body, init = {}) {
  return fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });
}

describe('GET /api/health', () => {
  it('возвращает 200 с uptime и timestamp', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.ts).toBe('number');
  });
});

describe('POST /api/quote', () => {
  it('happy path: валидный payload отправляет письмо и возвращает ok', async () => {
    const res = await postJson('/api/quote', validPayload);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailArgs = sendMailMock.mock.calls[0][0];
    expect(mailArgs.subject).toMatch(/КП/);
    expect(mailArgs.replyTo).toBe('ivan@example.com');
    expect(mailArgs.html).toContain('ВВГ 3х2.5');
  });

  it('honeypot — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      company_website: 'https://spam.example',
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('415 при отсутствии Content-Type: application/json', async () => {
    const res = await fetch(`${baseUrl}/api/quote`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(validPayload),
    });
    expect(res.status).toBe(415);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при коротком телефоне', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: { ...validPayload.customer, phone: '+7 999' },
    });
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при пустой корзине', async () => {
    const res = await postJson('/api/quote', { ...validPayload, items: [] });
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('400 при канале email без email', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: {
        ...validPayload.customer,
        email: '',
        preferredChannel: 'email',
      },
    });
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('replyTo не выставляется, если email пустой', async () => {
    await postJson('/api/quote', {
      ...validPayload,
      customer: { ...validPayload.customer, email: '' },
    });
    const mailArgs = sendMailMock.mock.calls[0][0];
    expect(mailArgs.replyTo).toBeUndefined();
  });
});
