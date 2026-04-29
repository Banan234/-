import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

// Мокаем nodemailer ДО импорта server.js — чтобы createTransport вернул
// заглушку и реальные SMTP-вызовы не уходили никуда. vi.hoisted гарантирует,
// что объявление sendMail поднимется выше vi.mock.
const { createTransportMock, sendMailMock } = vi.hoisted(() => {
  const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
  const createTransportMock = vi.fn(() => ({ sendMail: sendMailMock }));
  return { createTransportMock, sendMailMock };
});

vi.mock('nodemailer', () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

const {
  createApp,
  createTransporter,
  getMailSendOptions,
  getRuntimeHealthSnapshot,
  getSmtpTransportOptions,
  isRetryableMailError,
  sendMailWithRetry,
  createTrustedProxyFn,
  parseTrustedProxyIps,
  validateSiteUrlEnv,
} = await import('./server.js');
const { createCatalogQueryStore } = await import('./lib/catalogQuery.js');
const { MAX_QUOTE_ITEM_COMMENT_LENGTH, MAX_QUOTE_PAYLOAD_BYTES } =
  await import('./shared/quoteValidation.js');

let server;
let baseUrl;
const renderedAt = Date.parse('2026-04-26T05:00:00.000Z');

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
  createTransportMock.mockClear();
  createTransportMock.mockImplementation(() => ({ sendMail: sendMailMock }));
  sendMailMock.mockClear();
  sendMailMock.mockResolvedValue({ messageId: 'test-id' });
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
  rendered_at: renderedAt,
  submit_at: renderedAt + 3_000,
};

const validLeadPayload = {
  phone: '+7 (900) 123-45-67',
  comment: 'ВВГ 3х2.5',
  source: 'Тест',
  createdAt: '2026-04-26 10:00',
  rendered_at: renderedAt,
  submit_at: renderedAt + 3_000,
  company_website: '',
};

async function postJson(path, body, init = {}) {
  return postJsonTo(baseUrl, path, body, init);
}

async function postJsonTo(targetBaseUrl, path, body, init = {}) {
  const { headers: initHeaders = {}, ...restInit } = init;

  return fetch(`${targetBaseUrl}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 Vitest',
      'Accept-Language': 'ru-RU,ru;q=0.9',
      ...initHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...restInit,
  });
}

async function withTestServer(app, callback) {
  let localServer;
  await new Promise((resolve) => {
    localServer = app.listen(0, resolve);
  });
  const { port } = localServer.address();
  const localBaseUrl = `http://127.0.0.1:${port}`;

  try {
    return await callback(localBaseUrl);
  } finally {
    await new Promise((resolve) => localServer.close(resolve));
  }
}

const productFixtures = [
  {
    id: 101,
    sku: 'VVG-3-2-5',
    slug: 'vvgng-ls-3x2-5',
    title: 'ВВГнг-LS 3х2.5',
    fullName: 'Кабель ВВГнг-LS 3х2.5 0.66 кВ',
    mark: 'ВВГнг-LS',
    category: 'Силовой кабель',
    catalogCategory: 'Силовой кабель',
    catalogCategorySlug: 'silovoy-kabel',
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    cableDecoded: { decoded: ['медные жилы'] },
    cores: 3,
    crossSection: 2.5,
    voltage: 660,
    catalogApplicationType: 'силовой',
    catalogType: 'ПВХ',
    price: 120,
    stock: 10,
    unit: 'м',
  },
  {
    id: 102,
    sku: 'AVVG-4-16',
    slug: 'avvg-4x16',
    title: 'АВВГ 4х16',
    fullName: 'Кабель АВВГ 4х16 1 кВ',
    mark: 'АВВГ',
    category: 'Силовой кабель',
    catalogCategory: 'Силовой кабель',
    catalogCategorySlug: 'silovoy-kabel',
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    cableDecoded: { decoded: ['алюминиевые жилы'] },
    cores: 4,
    crossSection: 16,
    voltage: 1000,
    catalogApplicationType: 'силовой',
    catalogType: 'ПВХ',
    price: 260,
    stock: 4,
    unit: 'м',
  },
  {
    id: 103,
    sku: 'KG-4-4',
    slug: 'kg-4x4',
    title: 'КГ 4х4',
    fullName: 'Кабель гибкий КГ 4х4 0.66 кВ',
    mark: 'КГ',
    category: 'Гибкий кабель',
    catalogCategory: 'Гибкий кабель',
    catalogCategorySlug: 'gibkiy-kabel',
    catalogSection: 'Кабель и провод',
    catalogSectionSlug: 'kabel-i-provod',
    cableDecoded: { decoded: ['медные жилы'] },
    cores: 4,
    crossSection: 4,
    voltage: 660,
    catalogApplicationType: 'гибкий',
    catalogType: 'СПЭ',
    price: 310,
    stock: 12,
    unit: 'м',
  },
  {
    id: 104,
    sku: 'SIP-2-16',
    slug: 'sip-2x16',
    title: 'СИП-2 2х16',
    fullName: 'Провод СИП-2 2х16 0.6/1 кВ',
    mark: 'СИП-2',
    category: 'Самонесущий провод',
    catalogCategory: 'Самонесущий провод',
    catalogCategorySlug: 'samonesushchiy-provod',
    catalogSection: 'Провода',
    catalogSectionSlug: 'provoda',
    cableDecoded: { decoded: ['алюминиевые жилы'] },
    cores: 2,
    crossSection: 16,
    voltage: 1000,
    catalogApplicationType: 'воздушный',
    catalogType: 'ПВХ',
    price: 90,
    stock: 8,
    unit: 'м',
  },
];

function createProductCatalogApp(items = productFixtures) {
  const catalogStore = {
    loadCatalogProducts: vi.fn(async () => items),
    getCatalogProductListItems: vi.fn((value) => value),
    getCatalogProductListItemsByCategory: vi.fn((categorySlug, value) =>
      value.filter((item) => item.catalogCategorySlug === categorySlug)
    ),
    getCatalogProductsByCategory: vi.fn((categorySlug, value) =>
      value.filter((item) => item.catalogCategorySlug === categorySlug)
    ),
    findProductBySlug: vi.fn(async (slug) =>
      items.find((item) => item.slug === slug)
    ),
  };
  const catalogQueryStore = createCatalogQueryStore({
    getCatalogProductsByCategory: catalogStore.getCatalogProductsByCategory,
    facetCacheTtlMs: 0,
  });
  const app = createApp({
    rateLimitOptions: { limit: 1000 },
    catalogStore,
    catalogQueryStore,
  });

  return { app, catalogStore };
}

function parseCspHeader(value) {
  return Object.fromEntries(
    String(value || '')
      .split(';')
      .map((directive) => directive.trim())
      .filter(Boolean)
      .map((directive) => {
        const [name, ...tokens] = directive.split(/\s+/);
        return [name, tokens];
      })
  );
}

describe('GET /api/health', () => {
  it('возвращает 200 с uptime и timestamp', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(typeof data.uptime).toBe('number');
    expect(typeof data.ts).toBe('number');
    expect(data.runtime).toBeUndefined();
  });
});

describe('GET /api/runtime', () => {
  it('скрывает runtime-метрики без внутреннего токена', async () => {
    const app = createApp({ rateLimitOptions: { limit: 1000 } });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/runtime`);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.ok).toBe(false);
      expect(data.runtime).toBeUndefined();
    });
  });

  it('возвращает runtime-метрики только с валидным токеном', async () => {
    const originalToken = process.env.INTERNAL_METRICS_TOKEN;
    process.env.INTERNAL_METRICS_TOKEN = 'test-runtime-token';
    const app = createApp({ rateLimitOptions: { limit: 1000 } });

    try {
      await withTestServer(app, async (localBaseUrl) => {
        const denied = await fetch(`${localBaseUrl}/api/runtime`, {
          headers: { authorization: 'Bearer wrong-token' },
        });
        expect(denied.status).toBe(404);

        const res = await fetch(`${localBaseUrl}/api/runtime`, {
          headers: { authorization: 'Bearer test-runtime-token' },
        });
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.ok).toBe(true);
        expect(typeof data.uptime).toBe('number');
        expect(typeof data.ts).toBe('number');
        expect(data.runtime).toMatchObject({
          pid: expect.any(Number),
          node: expect.any(String),
          activeRequests: expect.any(Number),
          memoryMb: {
            rss: expect.any(Number),
            heapTotal: expect.any(Number),
            heapUsed: expect.any(Number),
            external: expect.any(Number),
            arrayBuffers: expect.any(Number),
          },
          eventLoopDelayMs: {
            mean: expect.any(Number),
            p95: expect.any(Number),
            max: expect.any(Number),
          },
          cpuUsageMs: {
            user: expect.any(Number),
            system: expect.any(Number),
          },
        });
      });
    } finally {
      if (originalToken === undefined) {
        delete process.env.INTERNAL_METRICS_TOKEN;
      } else {
        process.env.INTERNAL_METRICS_TOKEN = originalToken;
      }
    }
  });
});

describe('runtime health snapshot', () => {
  it('rounds memory and event loop metrics to compact numeric values', () => {
    const snapshot = getRuntimeHealthSnapshot({
      activeRequests: 7,
      eventLoopDelay: {
        mean: 1_250_000,
        max: 9_900_000,
        percentile: () => 2_500_000,
      },
    });

    expect(snapshot.activeRequests).toBe(7);
    expect(snapshot.memoryMb.rss).toEqual(expect.any(Number));
    expect(snapshot.eventLoopDelayMs).toEqual({
      mean: 1.3,
      p95: 2.5,
      max: 9.9,
    });
  });
});

describe('security headers', () => {
  it('выставляет security headers', async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    const csp = res.headers.get('content-security-policy');
    const cspDirectives = parseCspHeader(csp);
    const hsts = res.headers.get('strict-transport-security');

    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('referrer-policy')).toBe(
      'strict-origin-when-cross-origin'
    );
    expect(hsts).toContain('max-age=31536000');
    expect(hsts).toContain('includeSubDomains');
    expect(cspDirectives).toMatchObject({
      'default-src': ["'none'"],
      'base-uri': ["'none'"],
      'connect-src': ["'self'"],
      'font-src': ["'none'"],
      'form-action': ["'none'"],
      'frame-ancestors': ["'none'"],
      'frame-src': ["'none'"],
      'img-src': ["'none'"],
      'manifest-src': ["'none'"],
      'media-src': ["'none'"],
      'object-src': ["'none'"],
      'script-src': ["'none'"],
      'script-src-attr': ["'none'"],
      'style-src': ["'none'"],
      'worker-src': ["'none'"],
    });
    expect(csp).not.toContain("'unsafe-inline'");
    expect(csp).not.toContain('https:');
    expect(res.headers.get('x-powered-by')).toBeNull();
  });
});

describe('trusted proxy configuration', () => {
  it('parses comma/space-separated proxy list with loopback fallback', () => {
    expect(
      parseTrustedProxyIps(' 10.0.0.0/8, 192.168.0.0/16 loopback ')
    ).toEqual(['10.0.0.0/8', '192.168.0.0/16', 'loopback']);
    expect(parseTrustedProxyIps('')).toEqual(['loopback']);
  });

  it('trusts only configured proxy IP ranges', () => {
    const trustProxy = createTrustedProxyFn('loopback,10.0.0.0/8');

    expect(trustProxy('127.0.0.1')).toBe(true);
    expect(trustProxy('::ffff:127.0.0.1')).toBe(true);
    expect(trustProxy('10.20.30.40')).toBe(true);
    expect(trustProxy('203.0.113.10')).toBe(false);
  });

  it('sets Express trust proxy to the injected function', () => {
    const trustProxy = vi.fn(() => false);
    const app = createApp({
      rateLimitOptions: { limit: 1000 },
      trustProxy,
    });

    expect(app.get('trust proxy')).toBe(trustProxy);
    expect(app.get('trust proxy fn')('127.0.0.1')).toBe(false);
    expect(trustProxy).toHaveBeenCalledWith('127.0.0.1');
  });
});

describe('startup env validation', () => {
  it('accepts matching SITE_URL and VITE_SITE_URL after trailing slash normalization', () => {
    expect(
      validateSiteUrlEnv({
        SITE_URL: 'https://example.test/',
        VITE_SITE_URL: 'https://example.test',
      })
    ).toEqual({
      siteUrl: 'https://example.test',
      viteSiteUrl: 'https://example.test',
    });
  });

  it('allows only one canonical URL variable for local/dev scripts', () => {
    expect(
      validateSiteUrlEnv({
        SITE_URL: '',
        VITE_SITE_URL: 'http://localhost:5173/',
      })
    ).toEqual({
      siteUrl: 'http://localhost:5173',
      viteSiteUrl: 'http://localhost:5173',
    });
  });

  it('fails when SITE_URL and VITE_SITE_URL point to different origins', () => {
    expect(() =>
      validateSiteUrlEnv({
        SITE_URL: 'https://api.example.test',
        VITE_SITE_URL: 'https://www.example.test',
      })
    ).toThrow(
      'SITE_URL и VITE_SITE_URL должны совпадать: SITE_URL="https://api.example.test", VITE_SITE_URL="https://www.example.test"'
    );
  });

  it('fails on non-base or non-http canonical URLs', () => {
    expect(() =>
      validateSiteUrlEnv({
        SITE_URL: 'ftp://example.test',
        VITE_SITE_URL: 'ftp://example.test',
      })
    ).toThrow('SITE_URL должен использовать протокол http или https');

    expect(() =>
      validateSiteUrlEnv({
        SITE_URL: 'https://example.test?utm=1',
      })
    ).toThrow('SITE_URL должен быть базовым URL без userinfo, query и hash');
  });
});

describe('SMTP delivery', () => {
  it('builds pooled transporter options with bounded timeouts', () => {
    const options = getSmtpTransportOptions({
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '2525',
      SMTP_SECURE: 'false',
      SMTP_USER: 'user@example.test',
      SMTP_PASS: 'secret',
      SMTP_POOL: 'true',
      SMTP_POOL_MAX_CONNECTIONS: '3',
      SMTP_POOL_MAX_MESSAGES: '50',
      SMTP_CONNECTION_TIMEOUT_MS: '4000',
      SMTP_GREETING_TIMEOUT_MS: '5000',
      SMTP_SOCKET_TIMEOUT_MS: '6000',
    });

    expect(options).toMatchObject({
      host: 'smtp.example.test',
      port: 2525,
      secure: false,
      pool: true,
      maxConnections: 3,
      maxMessages: 50,
      connectionTimeout: 4000,
      greetingTimeout: 5000,
      socketTimeout: 6000,
      auth: {
        user: 'user@example.test',
        pass: 'secret',
      },
    });
  });

  it('uses safe defaults for SMTP send retry settings', () => {
    expect(getMailSendOptions({})).toEqual({
      maxRetries: 1,
      retryDelayMs: 750,
    });
  });

  it('creates one app-scoped transporter', () => {
    createTransportMock.mockClear();

    const app = createApp({ rateLimitOptions: { limit: 1000 } });

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    expect(app.locals.mailTransporter).toBeDefined();
  });

  it('passes transport options to nodemailer', () => {
    const env = {
      SMTP_HOST: 'smtp.example.test',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: 'mailer@example.test',
      SMTP_PASS: 'secret',
    };

    createTransporter(env);

    expect(createTransportMock).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        pool: true,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 20_000,
      })
    );
  });

  it('retries transient SMTP errors', async () => {
    const transientError = Object.assign(new Error('socket reset'), {
      code: 'ECONNRESET',
    });
    const transporter = {
      sendMail: vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ messageId: 'ok' }),
    };

    await expect(
      sendMailWithRetry(
        transporter,
        { subject: 'test' },
        { maxRetries: 1, retryDelayMs: 0 }
      )
    ).resolves.toEqual({ messageId: 'ok' });
    expect(transporter.sendMail).toHaveBeenCalledTimes(2);
  });

  it('does not retry permanent SMTP errors', async () => {
    const authError = Object.assign(new Error('bad auth'), { code: 'EAUTH' });
    const transporter = {
      sendMail: vi.fn().mockRejectedValue(authError),
    };

    await expect(
      sendMailWithRetry(
        transporter,
        { subject: 'test' },
        { maxRetries: 2, retryDelayMs: 0 }
      )
    ).rejects.toBe(authError);
    expect(transporter.sendMail).toHaveBeenCalledTimes(1);
  });

  it('classifies temporary 4xx SMTP responses as retryable', () => {
    expect(isRetryableMailError({ responseCode: 421 })).toBe(true);
    expect(isRetryableMailError({ responseCode: 550 })).toBe(false);
    expect(isRetryableMailError({ code: 'ETIMEDOUT' })).toBe(true);
    expect(isRetryableMailError({ code: 'EAUTH' })).toBe(false);
  });
});

describe('GET /api/products', () => {
  it('warms catalog caches on startup when enabled', async () => {
    const items = productFixtures;
    const catalogStore = {
      loadCatalogProducts: vi.fn(async () => items),
      getCatalogProductListItems: vi.fn((value) => value),
      getCatalogProductListItemsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      getCatalogProductsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      findProductBySlug: vi.fn(async (slug) =>
        items.find((item) => item.slug === slug)
      ),
    };
    const catalogQueryStore = {
      getCatalogQueryItems: vi.fn((value) => value),
      getSearchFilteredProducts: vi.fn((value) => value),
      getCatalogFacets: vi.fn(() => ({})),
      getCatalogSections: vi.fn(() => []),
    };

    const app = createApp({
      rateLimitOptions: { limit: 1000 },
      catalogStore,
      catalogQueryStore,
      warmCatalogOnStart: true,
    });

    await app.locals.catalogWarmupPromise;

    expect(catalogStore.loadCatalogProducts).toHaveBeenCalledTimes(1);
    expect(catalogStore.getCatalogProductListItems).toHaveBeenCalledWith(items);
    expect(catalogQueryStore.getCatalogSections).toHaveBeenCalledWith(items);
  });

  it('uses injected catalog stores and cached facets provider', async () => {
    const items = [
      {
        id: 1,
        sku: 'SKU-1',
        slug: 'alpha-cable',
        title: 'Alpha Cable',
        fullName: 'Alpha Cable',
        mark: 'ALPHA',
        category: 'Power cable',
        catalogCategory: 'Power cable',
        catalogCategorySlug: 'power-cable',
        catalogSection: 'Кабель и провод',
        catalogSectionSlug: 'kabel-i-provod',
        price: 100,
        stock: 10,
        unit: 'м',
      },
    ];
    const catalogStore = {
      loadCatalogProducts: vi.fn(async () => items),
      getCatalogProductListItems: vi.fn((value) => value),
      getCatalogProductListItemsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      getCatalogProductsByCategory: vi.fn((categorySlug, value) =>
        value.filter((item) => item.catalogCategorySlug === categorySlug)
      ),
      findProductBySlug: vi.fn(async (slug) =>
        items.find((item) => item.slug === slug)
      ),
    };
    const catalogQueryStore = {
      getCatalogQueryItems: vi.fn((value) => value),
      getSearchFilteredProducts: vi.fn((value) => value),
      getCatalogFacets: vi.fn(() => ({ materials: ['медь'] })),
      getCatalogSections: vi.fn(() => []),
    };
    const app = createApp({
      rateLimitOptions: { limit: 1000 },
      catalogStore,
      catalogQueryStore,
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/products?search=alpha`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items).toEqual(items);
      expect(data.meta.facets).toEqual({ materials: ['медь'] });
    });

    expect(catalogStore.loadCatalogProducts).toHaveBeenCalledTimes(1);
    expect(catalogQueryStore.getSearchFilteredProducts).toHaveBeenCalledWith(
      items,
      'alpha'
    );
    expect(catalogQueryStore.getCatalogFacets).toHaveBeenCalledWith(
      items,
      expect.objectContaining({
        categorySlug: '',
        search: 'alpha',
        catalogItems: items,
      })
    );
  });

  it('filters products by cross section', async () => {
    const { app } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({ section: '16' });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual([
        'AVVG-4-16',
        'SIP-2-16',
      ]);
      expect(data.meta.total).toBe(2);
      expect(data.meta.pagination).toBeNull();
      expect(data.meta.facets.sections).toEqual([2.5, 4, 16]);
    });
  });

  it('combines material and voltage filters with sorting', async () => {
    const { app } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({
        material: 'алюминий',
        voltage: '1000',
        sort: 'price-desc',
      });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual([
        'AVVG-4-16',
        'SIP-2-16',
      ]);
      expect(data.items.map((item) => item.price)).toEqual([260, 90]);
      expect(data.meta.total).toBe(2);
      expect(data.meta.facets.materials).toEqual(['алюминий', 'медь']);
      expect(data.meta.facets.voltages).toEqual([660, 1000]);
    });
  });

  it('paginates products with page and limit params', async () => {
    const manyItems = Array.from({ length: 25 }, (_, index) => ({
      ...productFixtures[0],
      id: 200 + index,
      sku: `PAGE-${String(index + 1).padStart(2, '0')}`,
      slug: `page-product-${index + 1}`,
      title: `Товар ${index + 1}`,
      fullName: `Тестовый товар ${index + 1}`,
      mark: `PAGE-${index + 1}`,
      price: index + 1,
      stock: index,
    }));
    const { app } = createProductCatalogApp(manyItems);

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({ page: '2', limit: '24' });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual(['PAGE-25']);
      expect(data.meta.count).toBe(1);
      expect(data.meta.total).toBe(25);
      expect(data.meta.pagination).toEqual({
        page: 2,
        limit: 24,
        total: 25,
        totalPages: 2,
      });
    });
  });

  it('combines category lookup with search and scoped facets', async () => {
    const { app, catalogStore } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const params = new URLSearchParams({
        category: 'silovoy-kabel',
        search: 'АВВГ',
      });
      const res = await fetch(`${localBaseUrl}/api/products?${params}`);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items.map((item) => item.sku)).toEqual(['AVVG-4-16']);
      expect(data.meta.total).toBe(1);
      expect(data.meta.filter).toEqual({ category: 'silovoy-kabel' });
      expect(data.meta.facets).toMatchObject({
        materials: ['алюминий'],
        sections: [16],
        voltages: [1000],
        minPrice: 260,
        maxPrice: 260,
      });
    });

    expect(catalogStore.getCatalogProductsByCategory).toHaveBeenCalledWith(
      'silovoy-kabel',
      productFixtures
    );
  });
});

describe('GET /api/products/featured', () => {
  it('caches featured list items by catalog identity and limit', async () => {
    const { app, catalogStore } = createProductCatalogApp();

    await withTestServer(app, async (localBaseUrl) => {
      const first = await fetch(
        `${localBaseUrl}/api/products/featured?limit=2`
      );
      const second = await fetch(
        `${localBaseUrl}/api/products/featured?limit=2`
      );

      expect(first.status).toBe(200);
      expect(second.status).toBe(200);
      await first.json();
      await second.json();
    });

    expect(catalogStore.loadCatalogProducts).toHaveBeenCalledTimes(2);
    expect(catalogStore.getCatalogProductListItems).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/products/lookup', () => {
  async function postLookup(localBaseUrl, body, headers = {}) {
    return fetch(`${localBaseUrl}/api/products/lookup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
  }

  it('возвращает found/missing по списку id', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await postLookup(localBaseUrl, { ids: [101, 9999, 104] });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.found.map((item) => item.id)).toEqual([101, 104]);
      expect(data.missing).toEqual([9999]);
    });
  });

  it('игнорирует дубли и невалидные id', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await postLookup(localBaseUrl, {
        ids: [101, 101, 0, -3, 'abc', null, 104],
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.found.map((item) => item.id).sort()).toEqual([101, 104]);
      expect(data.missing).toEqual([]);
    });
  });

  it('400 при отсутствии массива ids', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await postLookup(localBaseUrl, { foo: 'bar' });
      expect(res.status).toBe(400);
    });
  });

  it('400 при превышении лимита по числу id', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const ids = Array.from({ length: 201 }, (_, i) => i + 1);
      const res = await postLookup(localBaseUrl, { ids });
      expect(res.status).toBe(400);
    });
  });

  it('415 без application/json', async () => {
    const { app } = createProductCatalogApp();
    await withTestServer(app, async (localBaseUrl) => {
      const res = await fetch(`${localBaseUrl}/api/products/lookup`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: 'ids=1',
      });
      expect(res.status).toBe(415);
    });
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
    expect(mailArgs.html).toContain(
      'проверьте email отправителя в теле письма перед ответом'
    );
  });

  it('повторяет отправку при временной SMTP-ошибке', async () => {
    const transientError = Object.assign(new Error('temporary SMTP failure'), {
      responseCode: 421,
    });
    const mailTransporter = {
      sendMail: vi
        .fn()
        .mockRejectedValueOnce(transientError)
        .mockResolvedValueOnce({ messageId: 'retry-ok' }),
    };
    const app = createApp({
      rateLimitOptions: { limit: 1000 },
      mailTransporter,
      mailSendOptions: { maxRetries: 1, retryDelayMs: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
    });

    expect(mailTransporter.sendMail).toHaveBeenCalledTimes(2);
  });

  it('500 при финальной SMTP-ошибке после transport timeout', async () => {
    const timeoutError = Object.assign(new Error('socket timeout'), {
      code: 'ETIMEDOUT',
    });
    const mailTransporter = {
      sendMail: vi.fn().mockRejectedValue(timeoutError),
    };
    const app = createApp({
      rateLimitOptions: { limit: 1000 },
      mailTransporter,
      mailSendOptions: { maxRetries: 0, retryDelayMs: 0 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const res = await postJsonTo(localBaseUrl, '/api/quote', validPayload);
      const data = await res.json();

      expect(res.status).toBe(500);
      expect(data.ok).toBe(false);
      expect(data.message).toBe('Не удалось отправить заявку');
    });

    expect(mailTransporter.sendMail).toHaveBeenCalledTimes(1);
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

  it('honeypot — фейковый success ждёт response floor', async () => {
    const app = createApp({
      rateLimitOptions: { limit: 1000 },
      formResponseDelayRange: { min: 40, max: 40 },
    });

    await withTestServer(app, async (localBaseUrl) => {
      const startedAt = Date.now();
      const res = await postJsonTo(localBaseUrl, '/api/quote', {
        ...validPayload,
        company_website: 'https://spam.example',
      });
      const elapsedMs = Date.now() - startedAt;
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(elapsedMs).toBeGreaterThanOrEqual(35);
    });

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('быстрый submit — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      submit_at: validPayload.rendered_at + 500,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('пустые браузерные headers — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/quote', validPayload, {
      headers: {
        'User-Agent': '',
        'Accept-Language': '',
      },
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

  it('400 при мусорном телефоне', async () => {
    for (const phone of ['0000000000', '1234567890']) {
      sendMailMock.mockClear();

      const res = await postJson('/api/quote', {
        ...validPayload,
        customer: { ...validPayload.customer, phone },
      });

      expect(res.status).toBe(400);
      expect(sendMailMock).not.toHaveBeenCalled();
    }
  });

  it('400 при слишком длинном комментарии позиции', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      items: [
        {
          ...validPayload.items[0],
          comment: 'x'.repeat(MAX_QUOTE_ITEM_COMMENT_LENGTH + 1),
        },
      ],
    });

    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it('413 при превышении транспортного лимита JSON body', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      extra: 'x'.repeat(MAX_QUOTE_PAYLOAD_BYTES),
    });
    const data = await res.json();

    expect(res.status).toBe(413);
    expect(data.ok).toBe(false);
    expect(data.message).toBe('Слишком большой запрос');
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

  it('CRLF в email отбрасывается на валидации, replyTo не выставляется', async () => {
    const res = await postJson('/api/quote', {
      ...validPayload,
      customer: {
        ...validPayload.customer,
        email: 'ivan@example.com\r\nBcc: attacker@evil.com',
      },
    });
    // Валидация на normalizeEmail вычистит \r\n → email становится склеенным
    // и не проходит EMAIL_RE → 400 без отправки письма.
    expect(res.status).toBe(400);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});

describe('POST /api/lead-request', () => {
  it('happy path: валидный payload отправляет письмо и возвращает ok', async () => {
    const res = await postJson('/api/lead-request', validLeadPayload);
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).toHaveBeenCalledTimes(1);

    const mailArgs = sendMailMock.mock.calls[0][0];
    expect(mailArgs.subject).toMatch(/короткая заявка/i);
    expect(mailArgs.html).toContain('ВВГ 3х2.5');
  });

  it('400 при мусорном телефоне', async () => {
    for (const phone of ['0000000000', '1234567890']) {
      sendMailMock.mockClear();

      const res = await postJson('/api/lead-request', {
        ...validLeadPayload,
        phone,
      });

      expect(res.status).toBe(400);
      expect(sendMailMock).not.toHaveBeenCalled();
    }
  });

  it('быстрый submit — фейковый success без отправки письма', async () => {
    const res = await postJson('/api/lead-request', {
      ...validLeadPayload,
      submit_at: validLeadPayload.rendered_at + 500,
    });
    const data = await res.json();

    expect(res.status).toBe(200);
    expect(data.ok).toBe(true);
    expect(sendMailMock).not.toHaveBeenCalled();
  });
});
