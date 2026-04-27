import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import proxyaddr from 'proxy-addr';
import rateLimit from 'express-rate-limit';
import { pathToFileURL } from 'url';
import { createCatalogStore } from './lib/catalog.js';
import {
  MAX_QUOTE_PAYLOAD_BYTES,
  isValidQuoteRequest,
  isValidRussianPhone,
} from './lib/quoteValidation.js';
import { accessLog, logger } from './lib/logger.js';
import {
  CANONICAL_CATEGORY_ORDER,
  DEFAULT_PRODUCTS_LIMIT,
  MAX_PRODUCTS_LIMIT,
  applyProductFilters,
  buildProductSuggestions,
  createCatalogQueryStore,
  hasProductFilters,
  parseLimit,
  parsePage,
  sortProducts,
} from './lib/catalogQuery.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
const CATALOG_CACHE_TTL_SECONDS = 60;
const CATALOG_CACHE_TTL_MS = CATALOG_CACHE_TTL_SECONDS * 1000;
const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
const MIN_FORM_RENDER_MS = 2_000;
const DEFAULT_TRUSTED_PROXY_IPS = 'loopback';
const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10_000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 20_000;
const DEFAULT_SMTP_SEND_TIMEOUT_MS = 25_000;
const DEFAULT_SMTP_SEND_RETRIES = 1;
const DEFAULT_SMTP_RETRY_DELAY_MS = 750;
const RETRYABLE_MAIL_ERROR_CODES = new Set([
  'ECONNABORTED',
  'ECONNECTION',
  'ECONNREFUSED',
  'ECONNRESET',
  'EPIPE',
  'ESOCKET',
  'ETIMEDOUT',
  'EAI_AGAIN',
]);

const API_CSP_DIRECTIVES = Object.freeze({
  defaultSrc: ["'none'"],
  baseUri: ["'none'"],
  connectSrc: ["'self'"],
  fontSrc: ["'none'"],
  formAction: ["'none'"],
  frameAncestors: ["'none'"],
  frameSrc: ["'none'"],
  imgSrc: ["'none'"],
  manifestSrc: ["'none'"],
  mediaSrc: ["'none'"],
  objectSrc: ["'none'"],
  scriptSrc: ["'none'"],
  scriptSrcAttr: ["'none'"],
  styleSrc: ["'none'"],
  workerSrc: ["'none'"],
});

// Honeypot: скрытое поле, которое реальный пользователь не видит и не заполняет.
// Боты обычно заполняют все input'ы подряд — отдаём им фейковый success.
function isHoneypotTriggered(body) {
  return Boolean(
    body &&
    typeof body.company_website === 'string' &&
    body.company_website.trim()
  );
}

function getHeaderValue(req, name) {
  return String(req.get(name) || '').trim();
}

function hasBrowserLikeHeaders(req) {
  return Boolean(
    getHeaderValue(req, 'user-agent') && getHeaderValue(req, 'accept-language')
  );
}

function hasSuspiciousSubmitTiming(body) {
  const hasRenderedAt = Object.hasOwn(body || {}, 'rendered_at');
  const hasSubmitAt = Object.hasOwn(body || {}, 'submit_at');

  // Старые открытые вкладки после деплоя могут отправить payload без новых
  // полей. Не блокируем отсутствие обоих значений, но режем битые/слишком
  // быстрые значения, если клиент уже начал их присылать.
  if (!hasRenderedAt && !hasSubmitAt) return false;
  if (!hasRenderedAt || !hasSubmitAt) return true;

  const renderedAt = Number(body.rendered_at);
  const submitAt = Number(body.submit_at);

  if (!Number.isFinite(renderedAt) || !Number.isFinite(submitAt)) {
    return true;
  }

  return submitAt - renderedAt < MIN_FORM_RENDER_MS;
}

function getBotSubmissionSignal(req) {
  if (isHoneypotTriggered(req.body)) return 'honeypot';
  if (!hasBrowserLikeHeaders(req)) return 'missing_headers';
  if (hasSuspiciousSubmitTiming(req.body)) return 'fast_submit';
  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// На POST-эндпоинтах принимаем только JSON. Без Content-Type: application/json
// express.json() оставляет req.body пустым, isValidQuoteRequest всё равно
// вернёт false — но явный 415 быстрее даёт обратную связь и режет мусор.
function requireJsonContentType(req, res, next) {
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().includes('application/json')) {
    return res
      .status(415)
      .json({ ok: false, message: 'Ожидается Content-Type: application/json' });
  }
  return next();
}

function normalizeEmail(value) {
  // Удаляем любые control-символы (включая CR/LF/TAB) — защита от
  // header injection в replyTo при последующей отправке через SMTP.
  // Если после чистки строка перестаёт быть валидным email, isValidQuoteRequest
  // её отбросит на следующем шаге.
  return String(value ?? '')
    .replace(/[\x00-\x1f\x7f]/g, '')
    .trim()
    .toLowerCase();
}

// Финальный guard перед передачей пользовательского значения в SMTP-заголовок.
// nodemailer и сам валидирует, но defense-in-depth: явно отбрасываем строку
// при любом намёке на CR/LF/control-символы или несоответствие email-формату.
const SAFE_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function safeReplyTo(value) {
  const email = String(value ?? '');
  if (!email) return undefined;
  if (/[\r\n\x00-\x1f\x7f]/.test(email)) return undefined;
  if (!SAFE_EMAIL_RE.test(email)) return undefined;
  return email;
}

function normalizePhoneInput(value) {
  // Сохраняем + в начале, остальное — только цифры. Финальная валидация
  // живёт в isValidRussianPhone / isValidQuoteRequest.
  const raw = String(value ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  return raw.startsWith('+') ? `+${digits}` : digits;
}

function applyCatalogCache(res) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${CATALOG_CACHE_TTL_SECONDS}, must-revalidate`
  );
}

function parseBooleanEnv(value, fallback) {
  const normalized = String(value ?? '')
    .trim()
    .toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseIntegerEnv(value, fallback, { min = 1, max = Infinity } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

function readNonEmptyEnv(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function normalizeCanonicalSiteUrl(value, key) {
  const raw = readNonEmptyEnv(value);
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`${key} должен быть абсолютным http(s)-URL`);
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error(`${key} должен использовать протокол http или https`);
  }

  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error(
      `${key} должен быть базовым URL без userinfo, query и hash`
    );
  }

  return parsed.href.replace(/\/+$/, '');
}

export function validateSiteUrlEnv(env = process.env) {
  const siteUrl = normalizeCanonicalSiteUrl(env.SITE_URL, 'SITE_URL');
  const viteSiteUrl = normalizeCanonicalSiteUrl(
    env.VITE_SITE_URL,
    'VITE_SITE_URL'
  );

  if (siteUrl && viteSiteUrl && siteUrl !== viteSiteUrl) {
    throw new Error(
      `SITE_URL и VITE_SITE_URL должны совпадать: SITE_URL="${siteUrl}", VITE_SITE_URL="${viteSiteUrl}"`
    );
  }

  return {
    siteUrl: siteUrl || viteSiteUrl,
    viteSiteUrl,
  };
}

export function getSmtpTransportOptions(env = process.env) {
  const secure = parseBooleanEnv(env.SMTP_SECURE, true);
  const pool = parseBooleanEnv(env.SMTP_POOL, true);
  const options = {
    host: env.SMTP_HOST,
    port: parseIntegerEnv(env.SMTP_PORT, secure ? 465 : 587, {
      min: 1,
      max: 65_535,
    }),
    secure,
    pool,
    connectionTimeout: parseIntegerEnv(
      env.SMTP_CONNECTION_TIMEOUT_MS,
      DEFAULT_SMTP_CONNECTION_TIMEOUT_MS,
      { min: 1_000, max: 120_000 }
    ),
    greetingTimeout: parseIntegerEnv(
      env.SMTP_GREETING_TIMEOUT_MS,
      DEFAULT_SMTP_GREETING_TIMEOUT_MS,
      { min: 1_000, max: 120_000 }
    ),
    socketTimeout: parseIntegerEnv(
      env.SMTP_SOCKET_TIMEOUT_MS,
      DEFAULT_SMTP_SOCKET_TIMEOUT_MS,
      { min: 1_000, max: 300_000 }
    ),
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
  };

  if (pool) {
    options.maxConnections = parseIntegerEnv(env.SMTP_POOL_MAX_CONNECTIONS, 2, {
      min: 1,
      max: 10,
    });
    options.maxMessages = parseIntegerEnv(env.SMTP_POOL_MAX_MESSAGES, 100, {
      min: 1,
      max: 10_000,
    });
  }

  return options;
}

export function getMailSendOptions(env = process.env) {
  return {
    timeoutMs: parseIntegerEnv(
      env.SMTP_SEND_TIMEOUT_MS,
      DEFAULT_SMTP_SEND_TIMEOUT_MS,
      { min: 1_000, max: 300_000 }
    ),
    maxRetries: parseIntegerEnv(
      env.SMTP_SEND_RETRIES,
      DEFAULT_SMTP_SEND_RETRIES,
      { min: 0, max: 5 }
    ),
    retryDelayMs: parseIntegerEnv(
      env.SMTP_RETRY_DELAY_MS,
      DEFAULT_SMTP_RETRY_DELAY_MS,
      { min: 0, max: 60_000 }
    ),
  };
}

export function createTransporter(env = process.env) {
  return nodemailer.createTransport(getSmtpTransportOptions(env));
}

function createMailTimeoutError(timeoutMs) {
  const error = new Error(`SMTP send timed out after ${timeoutMs} ms`);
  error.code = 'SMTP_SEND_TIMEOUT';
  return error;
}

function withTimeout(promise, timeoutMs) {
  if (!timeoutMs) return promise;

  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(
        () => reject(createMailTimeoutError(timeoutMs)),
        timeoutMs
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isRetryableMailError(error) {
  const responseCode = Number(error?.responseCode);
  if (
    Number.isInteger(responseCode) &&
    responseCode >= 400 &&
    responseCode < 500
  ) {
    return true;
  }

  const code = String(error?.code || '').toUpperCase();
  return RETRYABLE_MAIL_ERROR_CODES.has(code);
}

export async function sendMailWithRetry(
  transporter,
  mailOptions,
  {
    event = 'smtp.send',
    timeoutMs = DEFAULT_SMTP_SEND_TIMEOUT_MS,
    maxRetries = DEFAULT_SMTP_SEND_RETRIES,
    retryDelayMs = DEFAULT_SMTP_RETRY_DELAY_MS,
  } = {}
) {
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await withTimeout(transporter.sendMail(mailOptions), timeoutMs);
    } catch (error) {
      if (attempt >= totalAttempts || !isRetryableMailError(error)) {
        throw error;
      }

      logger.warn('smtp.send.retry', {
        err: error,
        event,
        attempt,
        next_attempt: attempt + 1,
        max_retries: maxRetries,
        retry_delay_ms: retryDelayMs,
      });
      await wait(retryDelayMs);
    }
  }

  return null;
}

function createErrorResponse(res, message, status = 500) {
  return res.status(status).json({
    ok: false,
    message,
  });
}

export function parseTrustedProxyIps(value = process.env.TRUSTED_PROXY_IPS) {
  const raw = String(value ?? '').trim() || DEFAULT_TRUSTED_PROXY_IPS;
  return raw.split(/[\s,]+/).filter(Boolean);
}

export function createTrustedProxyFn(value = process.env.TRUSTED_PROXY_IPS) {
  return proxyaddr.compile(parseTrustedProxyIps(value));
}

const QUOTE_CHANNEL_LABELS = {
  phone: 'Звонок по телефону',
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  email: 'Email',
};

function createQuoteItemsHtml(items) {
  return items
    .map(
      (item) => `
          <tr>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.title)}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.sku) || '—'}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.category)}</td>
            <td style="padding:8px;border:1px solid #ddd;">${escapeHtml(item.quantity)} ${escapeHtml(item.unit) || ''}</td>
            <td style="padding:8px;border:1px solid #ddd;">${Number(item.price || 0) > 0 ? `${escapeHtml(item.price)} ₽` : 'Рассчитать'}</td>
          </tr>
          ${
            item.comment
              ? `<tr><td colspan="5" style="padding:8px;border:1px solid #ddd;color:#555;">Комментарий: ${escapeHtml(item.comment)}</td></tr>`
              : ''
          }
        `
    )
    .join('');
}

// Фабрика express-инстанса. Каждый вызов создаёт изолированный rate limiter
// и cors-allowlist — что позволяет параллельным интеграционным тестам не
// влиять друг на друга. На проде вызывается ровно один раз из main-блока.
export function createApp({
  rateLimitOptions,
  trustProxy = createTrustedProxyFn(),
  catalogStore = createCatalogStore(),
  catalogQueryStore = createCatalogQueryStore({
    getCatalogProductsByCategory: catalogStore.getCatalogProductsByCategory,
    facetCacheTtlMs: CATALOG_CACHE_TTL_MS,
  }),
  mailTransporter = createTransporter(),
  mailSendOptions = getMailSendOptions(),
} = {}) {
  const app = express();
  app.set('etag', false);
  app.set('trust proxy', trustProxy);
  app.locals.mailTransporter = mailTransporter;

  // 3 заявки/час с одного IP. B2B-снабженец редко шлёт КП чаще; для абуза
  // (массовая рассылка через нашу SMTP, перебор email replyTo) этот лимит уже
  // дорог. Если реальный клиент упёрся — попросит менеджера по телефону.
  const quoteRateLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 3,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: {
      ok: false,
      message: 'Слишком много заявок. Попробуйте через час или позвоните нам.',
    },
    ...rateLimitOptions,
  });

  // CORS-allowlist. В проде фронт и API на одном домене — CORS не нужен;
  // если ALLOWED_ORIGINS не задан, отдаём заголовки только для same-origin
  // (cors() c origin=false по сути выключает CORS). В dev указывайте
  // ALLOWED_ORIGINS=http://localhost:5173 или совпадающий VITE_SITE_URL.
  const allowedOrigins = String(process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(accessLog());
  app.use(
    cors({
      origin(origin, callback) {
        // Запросы без Origin (curl, same-origin, server-to-server) пропускаем.
        if (!origin) return callback(null, true);
        if (allowedOrigins.length === 0) return callback(null, false);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        return callback(null, false);
      },
    })
  );
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: API_CSP_DIRECTIVES,
      },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      strictTransportSecurity: {
        maxAge: HSTS_MAX_AGE_SECONDS,
        includeSubDomains: true,
      },
      xFrameOptions: { action: 'deny' },
    })
  );
  app.use('/api/products', compression());
  app.use(express.json({ limit: MAX_QUOTE_PAYLOAD_BYTES }));
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ ok: false, message: 'Слишком большой запрос' });
    }
    return next(err);
  });

  // Liveness-проба для Nginx/Docker/k8s. Никакого I/O — отвечает мгновенно
  // и подтверждает, что процесс жив и event loop не залип.
  app.get('/api/health', (req, res) => {
    res.json({ ok: true, uptime: process.uptime(), ts: Date.now() });
  });

  app.get('/api/products', async (req, res) => {
    try {
      applyCatalogCache(res);

      const allItems = await catalogStore.loadCatalogProducts();
      const categorySlug =
        typeof req.query.category === 'string' ? req.query.category.trim() : '';
      const hasPagination = req.query.page != null || req.query.limit != null;
      const hasFilters = hasProductFilters(req.query);
      const baseItems = catalogQueryStore.getCatalogQueryItems(
        allItems,
        categorySlug
      );
      const searchedItems = catalogQueryStore.getSearchFilteredProducts(
        baseItems,
        req.query.search
      );
      const facets = catalogQueryStore.getCatalogFacets(searchedItems, {
        categorySlug,
        search: req.query.search,
        catalogItems: allItems,
      });
      const filteredItems = sortProducts(
        applyProductFilters(searchedItems, req.query),
        req.query.sort
      );
      const total = filteredItems.length;

      let responseItems;
      let pagination = null;

      if (hasPagination) {
        const limit = parseLimit(
          req.query.limit,
          DEFAULT_PRODUCTS_LIMIT,
          MAX_PRODUCTS_LIMIT
        );
        const totalPages = Math.max(1, Math.ceil(total / limit));
        const page = Math.min(parsePage(req.query.page), totalPages);
        const start = (page - 1) * limit;
        responseItems = catalogStore.getCatalogProductListItems(
          filteredItems.slice(start, start + limit)
        );
        pagination = { page, limit, total, totalPages };
      } else if (
        !hasFilters &&
        categorySlug &&
        CANONICAL_CATEGORY_ORDER.has(categorySlug)
      ) {
        responseItems = catalogStore.getCatalogProductListItemsByCategory(
          categorySlug,
          allItems
        );
      } else if (!hasFilters) {
        responseItems = catalogStore.getCatalogProductListItems(baseItems);
      } else {
        responseItems = catalogStore.getCatalogProductListItems(filteredItems);
      }

      return res.json({
        ok: true,
        items: responseItems,
        meta: {
          count: responseItems.length,
          total,
          catalogCount: allItems.length,
          pagination,
          facets,
          // Дерево категорий считаем всегда по полному каталогу, чтобы фильтр в URL
          // не схлопывал боковую навигацию.
          catalogSections: catalogQueryStore.getCatalogSections(allItems),
          filter: categorySlug ? { category: categorySlug } : null,
        },
      });
    } catch (error) {
      logger.error('catalog.list.failed', { err: error });
      return createErrorResponse(res, 'Не удалось загрузить каталог');
    }
  });

  app.get('/api/products/featured', async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(req.query.limit, 10, 50);
      const items = await catalogStore.loadCatalogProducts();
      const featured = [...items]
        .sort((a, b) => {
          const promotedDiff = (b.promoted ? 1 : 0) - (a.promoted ? 1 : 0);
          if (promotedDiff !== 0) return promotedDiff;
          return (b.stock || 0) - (a.stock || 0);
        })
        .slice(0, limit);

      return res.json({
        ok: true,
        items: catalogStore.getCatalogProductListItems(featured),
      });
    } catch (error) {
      logger.error('catalog.featured.failed', { err: error });
      return createErrorResponse(res, 'Не удалось загрузить позиции');
    }
  });

  app.get('/api/products/suggestions', async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(req.query.limit, 7, 20);
      const items = await catalogStore.loadCatalogProducts();

      return res.json({
        ok: true,
        items: buildProductSuggestions(items, req.query.search, limit),
      });
    } catch (error) {
      logger.error('catalog.suggestions.failed', { err: error });
      return createErrorResponse(res, 'Не удалось загрузить подсказки');
    }
  });

  app.get('/api/products/:slug/related', async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(req.query.limit, 6, 24);
      const product = await catalogStore.findProductBySlug(req.params.slug);

      if (!product) {
        return res.status(404).json({
          ok: false,
          message: 'Товар не найден',
        });
      }

      const items = await catalogStore.loadCatalogProducts();
      const related = items
        .filter(
          (item) => item.id !== product.id && item.category === product.category
        )
        .slice(0, limit);

      return res.json({
        ok: true,
        items: catalogStore.getCatalogProductListItems(related),
      });
    } catch (error) {
      logger.error('catalog.related.failed', {
        err: error,
        slug: req.params.slug,
      });
      return createErrorResponse(res, 'Не удалось загрузить похожие товары');
    }
  });

  app.get('/api/products/:slug', async (req, res) => {
    try {
      applyCatalogCache(res);

      const item = await catalogStore.findProductBySlug(req.params.slug);

      if (!item) {
        return res.status(404).json({
          ok: false,
          message: 'Товар не найден',
        });
      }

      return res.json({
        ok: true,
        item,
      });
    } catch (error) {
      logger.error('catalog.product.failed', {
        err: error,
        slug: req.params.slug,
      });
      return createErrorResponse(res, 'Не удалось загрузить товар');
    }
  });

  app.post(
    '/api/quote',
    requireJsonContentType,
    quoteRateLimiter,
    async (req, res) => {
      try {
        if (getBotSubmissionSignal(req)) {
          return res.json({ ok: true, message: 'Заявка успешно отправлена' });
        }

        const {
          customer: rawCustomer,
          items,
          totalCount,
          totalPrice,
          createdAt,
        } = req.body;
        const customer = rawCustomer
          ? {
              ...rawCustomer,
              phone: normalizePhoneInput(rawCustomer.phone),
              email: normalizeEmail(rawCustomer.email),
            }
          : rawCustomer;

        const quoteRequest = { ...req.body, customer, items };

        if (!isValidQuoteRequest(quoteRequest)) {
          return createErrorResponse(res, 'Некорректные данные заявки', 400);
        }

        const html = `
        <h2>Новая заявка на коммерческое предложение</h2>

        <p><strong>Дата:</strong> ${escapeHtml(createdAt)}</p>

        <h3>Контакты клиента</h3>
        <p><strong>Имя:</strong> ${escapeHtml(customer.name)}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(customer.phone)}</p>
        <p><strong>Email:</strong> ${escapeHtml(customer.email) || '—'}</p>
        <div style="margin:12px 0;padding:10px 12px;border:1px solid #f59e0b;background:#fef3c7;color:#92400e;">
          <strong>Проверка безопасности:</strong> проверьте email отправителя в теле письма перед ответом.
        </div>
        <p><strong>Предпочтительный канал:</strong> ${escapeHtml(QUOTE_CHANNEL_LABELS[customer.preferredChannel] || customer.preferredChannel) || '—'}</p>
        <p><strong>Комментарий:</strong> ${escapeHtml(customer.comment) || '—'}</p>

        <h3>Состав заявки</h3>
        <table style="border-collapse:collapse;width:100%;">
          <thead>
            <tr>
              <th style="padding:8px;border:1px solid #ddd;">Товар</th>
              <th style="padding:8px;border:1px solid #ddd;">SKU</th>
              <th style="padding:8px;border:1px solid #ddd;">Категория</th>
              <th style="padding:8px;border:1px solid #ddd;">Метраж/объём</th>
              <th style="padding:8px;border:1px solid #ddd;">Цена</th>
            </tr>
          </thead>
          <tbody>
            ${createQuoteItemsHtml(items)}
          </tbody>
        </table>

        <p><strong>Всего позиций:</strong> ${totalCount}</p>
        <p><strong>Общая сумма:</strong> ${totalPrice} ₽</p>
      `;

        const replyTo = safeReplyTo(customer.email);

        await sendMailWithRetry(
          mailTransporter,
          {
            from: process.env.SMTP_FROM,
            to: process.env.QUOTE_TO_EMAIL,
            ...(replyTo ? { replyTo } : {}),
            subject: 'Новая заявка на КП — ЮжУралЭлектроКабель',
            html,
          },
          { ...mailSendOptions, event: 'quote.send' }
        );

        return res.json({
          ok: true,
          message: 'Заявка успешно отправлена',
        });
      } catch (error) {
        logger.error('quote.send.failed', { err: error });
        return createErrorResponse(res, 'Не удалось отправить заявку');
      }
    }
  );

  app.post(
    '/api/lead-request',
    requireJsonContentType,
    quoteRateLimiter,
    async (req, res) => {
      try {
        if (getBotSubmissionSignal(req)) {
          return res.json({
            ok: true,
            message: 'Заявка отправлена. Мы скоро свяжемся с вами.',
          });
        }

        const { name, phone, comment, source, createdAt } = req.body;
        const contactName = String(name || '').trim();
        const normalizedPhone = normalizePhoneInput(phone);

        if (!isValidRussianPhone(normalizedPhone)) {
          return createErrorResponse(res, 'Укажите корректный телефон', 400);
        }

        const html = `
        <h2>Новая короткая заявка</h2>
        <p><strong>Дата:</strong> ${escapeHtml(createdAt) || '—'}</p>
        <p><strong>Источник:</strong> ${escapeHtml(source) || '—'}</p>
        <p><strong>Контактное лицо:</strong> ${escapeHtml(contactName) || 'Не указано'}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(normalizedPhone)}</p>
        <p><strong>Комментарий:</strong> ${escapeHtml(comment) || '—'}</p>
      `;

        await sendMailWithRetry(
          mailTransporter,
          {
            from: process.env.SMTP_FROM,
            to: process.env.QUOTE_TO_EMAIL,
            subject: 'Новая короткая заявка — ЮжУралЭлектроКабель',
            html,
          },
          { ...mailSendOptions, event: 'lead.send' }
        );

        return res.json({
          ok: true,
          message: 'Заявка отправлена. Мы скоро свяжемся с вами.',
        });
      } catch (error) {
        logger.error('lead.send.failed', { err: error });
        return createErrorResponse(res, 'Не удалось отправить заявку');
      }
    }
  );

  return app;
}

// Запускаем listen только если файл вызван напрямую (`node server.js`),
// а не импортирован тестом или другим скриптом.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// Проверка обязательных env-переменных на старте. Не валим процесс —
// каталог должен работать без SMTP, — но громко предупреждаем, чтобы
// «тихая» поломка форм не дотянула до прода. В тестах не вызывается.
function warnIfSmtpMisconfigured() {
  const required = [
    'SMTP_HOST',
    'SMTP_USER',
    'SMTP_PASS',
    'SMTP_FROM',
    'QUOTE_TO_EMAIL',
  ];
  const missing = required.filter(
    (key) => !String(process.env[key] || '').trim()
  );
  if (missing.length > 0) {
    logger.warn('startup.smtp_misconfigured', {
      missing,
      hint: 'заявки /api/quote и /api/lead-request не будут отправляться',
    });
  }
}

if (isMain) {
  try {
    validateSiteUrlEnv();
    warnIfSmtpMisconfigured();
  } catch (error) {
    logger.error('startup.env_invalid', { err: error });
    process.exit(1);
  }

  const app = createApp();
  app.listen(PORT, () => {
    logger.info('startup.listening', { port: PORT });
  });
}
