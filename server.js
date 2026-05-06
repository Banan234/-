import express from 'express';
import cors from 'cors';
import compression from 'compression';
import dotenv from 'dotenv';
import helmet from 'helmet';
import nodemailer from 'nodemailer';
import proxyaddr from 'proxy-addr';
import rateLimit from 'express-rate-limit';
import { monitorEventLoopDelay } from 'perf_hooks';
import { pathToFileURL } from 'url';
import { createCatalogStore } from './lib/catalog.js';
import {
  MAX_QUOTE_ITEMS,
  MAX_QUOTE_PAYLOAD_BYTES,
  isValidQuoteRequest,
  isValidRussianPhone,
} from './shared/quoteValidation.js';
import { formatMessage, messages } from './shared/messages.js';
import { accessLog, logger } from './lib/logger.js';
import {
  CANONICAL_CATEGORY_ORDER,
  DEFAULT_PRODUCTS_LIMIT,
  MAX_PRODUCTS_LIMIT,
  applyCatalogFiltersAndSort,
  buildProductSuggestions,
  createCatalogQueryStore,
  hasProductFilters,
  parseLimit,
  parsePage,
} from './lib/catalogQuery.js';

dotenv.config();

const PORT = process.env.PORT || 3001;
const CATALOG_CACHE_TTL_SECONDS = 60;
const CATALOG_CACHE_TTL_MS = CATALOG_CACHE_TTL_SECONDS * 1000;
const DEFAULT_FEATURED_PRODUCTS_LIMIT = 10;
const MAX_FEATURED_PRODUCTS_LIMIT = 50;
const HSTS_MAX_AGE_SECONDS = 365 * 24 * 60 * 60;
// Anti-bot time trap: 2s is low enough for browser autofill/manual submit,
// but cuts off scripts that POST immediately after loading the form.
const MIN_FORM_RENDER_MS = 2_000;
// Response floor for form endpoints. Honeypot/fast-submit branches return a
// fake success without SMTP; this delay keeps that branch from being trivially
// distinguishable from a real sendMail path by response timing.
const FORM_RESPONSE_DELAY_RANGE_MS = Object.freeze({ min: 1_200, max: 2_600 });
const DEFAULT_TRUSTED_PROXY_IPS = 'loopback';
const DEFAULT_SMTP_CONNECTION_TIMEOUT_MS = 10_000;
const DEFAULT_SMTP_GREETING_TIMEOUT_MS = 10_000;
const DEFAULT_SMTP_SOCKET_TIMEOUT_MS = 20_000;
const DEFAULT_SMTP_SEND_RETRIES = 1;
const DEFAULT_SMTP_RETRY_DELAY_MS = 750;
const QUOTE_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const LEAD_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const BOT_FORM_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const QUOTE_RATE_LIMIT = 12;
const LEAD_RATE_LIMIT = 30;
const BOT_FORM_RATE_LIMIT = 5;
const MAX_LEAD_NAME_LENGTH = 120;
const MAX_LEAD_COMMENT_LENGTH = 1000;
const MAX_LEAD_SOURCE_LENGTH = 160;
const RUNTIME_EVENT_LOOP_DELAY = monitorEventLoopDelay({ resolution: 20 });
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

RUNTIME_EVENT_LOOP_DELAY.enable();

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
const API_PERMISSIONS_POLICY =
  'accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()';

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

function isBotSubmission(req) {
  return Boolean(getBotSubmissionSignal(req));
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
    return res.status(415).json({
      ok: false,
      message: messages.errors.api.expectedJsonContentType,
    });
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

function isTrimmedStringWithinLength(value, maxLength) {
  return String(value ?? '').trim().length <= maxLength;
}

function applyCatalogCache(res) {
  res.setHeader(
    'Cache-Control',
    `public, max-age=${CATALOG_CACHE_TTL_SECONDS}, must-revalidate`
  );
}

function getFeaturedProducts(items, limit) {
  return [...items]
    .sort((a, b) => {
      const promotedDiff = (b.promoted ? 1 : 0) - (a.promoted ? 1 : 0);
      if (promotedDiff !== 0) return promotedDiff;
      return (b.stock || 0) - (a.stock || 0);
    })
    .slice(0, limit);
}

async function warmCatalogCaches({
  catalogStore,
  catalogQueryStore,
  warmFeatured,
  featuredLimit = DEFAULT_FEATURED_PRODUCTS_LIMIT,
}) {
  const items = await catalogStore.loadCatalogProducts();
  catalogStore.getCatalogProductListItems(items);
  catalogQueryStore.getCatalogSections(items);
  if (warmFeatured) {
    await warmFeatured(featuredLimit, items);
  }
  return items.length;
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

const SMTP_REQUIRED_ENV_KEYS = Object.freeze([
  'SMTP_HOST',
  'SMTP_USER',
  'SMTP_PASS',
  'SMTP_FROM',
  'QUOTE_TO_EMAIL',
]);

export function getFormsDiagnostic(env = process.env) {
  const missing = SMTP_REQUIRED_ENV_KEYS.filter(
    (key) => !String(env[key] || '').trim()
  );
  const formsEnabled = parseBooleanEnv(env.FORMS_ENABLED, true);

  return {
    formsEnabled,
    smtpConfigured: missing.length === 0,
    missing,
  };
}

function withFormsSmtpStatus(diagnostic, { smtpVerified = null } = {}) {
  return {
    ...diagnostic,
    smtpVerified,
    smtpReady:
      diagnostic.formsEnabled &&
      diagnostic.smtpConfigured &&
      smtpVerified !== false,
  };
}

export function validateFormsEnv(env = process.env) {
  const diagnostic = getFormsDiagnostic(env);
  if (!diagnostic.formsEnabled) return diagnostic;
  if (env.NODE_ENV === 'production' && diagnostic.missing.length > 0) {
    throw new Error(
      `SMTP не настроен: задайте ${diagnostic.missing.join(', ')} или FORMS_ENABLED=false`
    );
  }
  return diagnostic;
}

export function validateStartupEnv(env = process.env) {
  const site = validateSiteUrlEnv(env);
  const forms = validateFormsEnv(env);

  return { site, forms };
}

function getBearerToken(req) {
  const authorization = String(req.get('authorization') || '').trim();
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match ? match[1].trim() : '';
}

function hasInternalMetricsAccess(req) {
  const token = readNonEmptyEnv(process.env.INTERNAL_METRICS_TOKEN);
  if (!token) return false;

  return (
    getBearerToken(req) === token ||
    String(req.get('x-internal-metrics-token') || '').trim() === token
  );
}

function bytesToMb(value) {
  return Math.round((value / 1024 / 1024) * 10) / 10;
}

function nanosecondsToMs(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value / 1e6) * 10) / 10;
}

export function getRuntimeHealthSnapshot({
  activeRequests = 0,
  eventLoopDelay = RUNTIME_EVENT_LOOP_DELAY,
} = {}) {
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage();
  return {
    pid: process.pid,
    node: process.version,
    activeRequests,
    memoryMb: {
      rss: bytesToMb(memory.rss),
      heapTotal: bytesToMb(memory.heapTotal),
      heapUsed: bytesToMb(memory.heapUsed),
      external: bytesToMb(memory.external),
      arrayBuffers: bytesToMb(memory.arrayBuffers),
    },
    eventLoopDelayMs: {
      mean: nanosecondsToMs(eventLoopDelay.mean),
      p95: nanosecondsToMs(eventLoopDelay.percentile(95)),
      max: nanosecondsToMs(eventLoopDelay.max),
    },
    cpuUsageMs: {
      user: Math.round(cpu.user / 1000),
      system: Math.round(cpu.system / 1000),
    },
  };
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

export async function verifySmtpTransporter(transporter) {
  if (!transporter || typeof transporter.verify !== 'function') {
    throw new Error('SMTP transporter не поддерживает verify()');
  }

  await transporter.verify();
  return true;
}

export async function initializeFormsForStartup({
  env = process.env,
  mailTransporter,
} = {}) {
  const diagnostic = validateFormsEnv(env);

  if (!diagnostic.formsEnabled) {
    return {
      transporter: null,
      diagnostic: withFormsSmtpStatus(diagnostic, { smtpVerified: null }),
    };
  }

  if (!diagnostic.smtpConfigured) {
    return {
      transporter: null,
      diagnostic: withFormsSmtpStatus(diagnostic, { smtpVerified: false }),
    };
  }

  const transporter = mailTransporter || createTransporter(env);

  try {
    await verifySmtpTransporter(transporter);
    return {
      transporter,
      diagnostic: withFormsSmtpStatus(diagnostic, { smtpVerified: true }),
    };
  } catch (error) {
    const message =
      'SMTP verify не прошёл: проверьте SMTP_HOST/SMTP_PORT/SMTP_SECURE, логин, app password и доступность SMTP-сервера. ' +
      'Для временного отключения заявок задайте FORMS_ENABLED=false.';

    if (env.NODE_ENV === 'production') {
      throw new Error(message, { cause: error });
    }

    logger.error('startup.smtp_verify_failed', {
      err: error,
      hint: message,
    });

    return {
      transporter: null,
      diagnostic: withFormsSmtpStatus(diagnostic, { smtpVerified: false }),
    };
  }
}

function getFormsUnavailableMessage(formsDiagnostic) {
  if (!formsDiagnostic.formsEnabled) {
    return messages.errors.api.formsDisabled;
  }

  return messages.errors.api.formsUnavailable;
}

function wait(ms) {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTestRuntime() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

function getDefaultFormResponseDelayRange() {
  if (isTestRuntime()) return { min: 0, max: 0 };
  return FORM_RESPONSE_DELAY_RANGE_MS;
}

function normalizeFormResponseDelayRange(range) {
  const min = Number(range?.min);
  const max = Number(range?.max);
  const normalizedMin = Number.isFinite(min) ? Math.max(0, Math.floor(min)) : 0;
  const normalizedMax = Number.isFinite(max)
    ? Math.max(normalizedMin, Math.floor(max))
    : normalizedMin;

  return { min: normalizedMin, max: normalizedMax };
}

function pickFormResponseDelayMs(range) {
  const { min, max } = range;
  if (max <= min) return min;
  return min + Math.floor(Math.random() * (max - min + 1));
}

async function waitForFormResponseFloor(startedAt, targetDelayMs) {
  const elapsedMs = Date.now() - startedAt;
  await wait(targetDelayMs - elapsedMs);
}

async function sendFormJson(res, startedAt, targetDelayMs, body, status = 200) {
  await waitForFormResponseFloor(startedAt, targetDelayMs);
  return res.status(status).json(body);
}

async function sendFormErrorResponse(
  res,
  startedAt,
  targetDelayMs,
  message,
  status = 500
) {
  return sendFormJson(
    res,
    startedAt,
    targetDelayMs,
    { ok: false, message },
    status
  );
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
    maxRetries = DEFAULT_SMTP_SEND_RETRIES,
    retryDelayMs = DEFAULT_SMTP_RETRY_DELAY_MS,
  } = {}
) {
  const totalAttempts = maxRetries + 1;

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
    try {
      return await transporter.sendMail(mailOptions);
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
  quoteRateLimitOptions,
  leadRateLimitOptions,
  botRateLimitOptions,
  env = process.env,
  trustProxy = createTrustedProxyFn(),
  catalogStore = createCatalogStore(),
  catalogQueryStore = createCatalogQueryStore({
    getCatalogProductsByCategory: catalogStore.getCatalogProductsByCategory,
    facetCacheTtlMs: CATALOG_CACHE_TTL_MS,
  }),
  mailTransporter,
  formsDiagnostic,
  mailSendOptions = getMailSendOptions(env),
  formResponseDelayRange = getDefaultFormResponseDelayRange(),
  warmCatalogOnStart = false,
} = {}) {
  const app = express();
  const startupFormsDiagnostic = withFormsSmtpStatus(
    formsDiagnostic || validateFormsEnv(env),
    {
      smtpVerified:
        formsDiagnostic && Object.hasOwn(formsDiagnostic, 'smtpVerified')
          ? formsDiagnostic.smtpVerified
          : null,
    }
  );
  const resolvedMailTransporter =
    mailTransporter ||
    (startupFormsDiagnostic.formsEnabled &&
    startupFormsDiagnostic.smtpConfigured &&
    startupFormsDiagnostic.smtpVerified !== false
      ? createTransporter(env)
      : null);

  app.set('etag', false);
  app.set('trust proxy', trustProxy);
  app.locals.mailTransporter = resolvedMailTransporter;
  app.locals.formsDiagnostic = startupFormsDiagnostic;
  app.locals.activeRequests = 0;
  app.locals.catalogWarmupPromise = null;
  let featuredProductsCache = null;
  const normalizedFormResponseDelayRange = normalizeFormResponseDelayRange(
    formResponseDelayRange
  );

  async function getFeaturedProductsResponse(limit, allItems) {
    const items = allItems || (await catalogStore.loadCatalogProducts());

    if (
      featuredProductsCache &&
      featuredProductsCache.catalogItems === items &&
      featuredProductsCache.limit === limit
    ) {
      return featuredProductsCache.responseItems;
    }

    const featured = getFeaturedProducts(items, limit);
    const responseItems = catalogStore.getCatalogProductListItems(featured);
    featuredProductsCache = {
      catalogItems: items,
      limit,
      responseItems,
    };
    return responseItems;
  }

  if (warmCatalogOnStart) {
    app.locals.catalogWarmupPromise = warmCatalogCaches({
      catalogStore,
      catalogQueryStore,
      warmFeatured: getFeaturedProductsResponse,
    })
      .then((count) => {
        logger.info('startup.catalog_warmed', { count });
        return count;
      })
      .catch((error) => {
        logger.error('startup.catalog_warm_failed', { err: error });
        return 0;
      });
  }

  // Формы имеют разную "цену": короткая заявка часто используется из модалок
  // и hero-блока, а полноценное КП тяжелее для менеджера. Лимиты раздельные и
  // достаточно мягкие для офисов за корпоративным NAT.
  const formRateLimitMessage = {
    ok: false,
    message: messages.errors.api.quoteRateLimited,
  };
  const sharedFormRateLimitOptions = {
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    ...rateLimitOptions,
  };
  const botFormRateLimiter = rateLimit({
    windowMs: BOT_FORM_RATE_LIMIT_WINDOW_MS,
    limit: BOT_FORM_RATE_LIMIT,
    message: formRateLimitMessage,
    skip: (req) => !isBotSubmission(req),
    ...sharedFormRateLimitOptions,
    ...botRateLimitOptions,
  });
  const quoteRateLimiter = rateLimit({
    windowMs: QUOTE_RATE_LIMIT_WINDOW_MS,
    limit: QUOTE_RATE_LIMIT,
    message: formRateLimitMessage,
    skip: isBotSubmission,
    ...sharedFormRateLimitOptions,
    ...quoteRateLimitOptions,
  });
  const leadRateLimiter = rateLimit({
    windowMs: LEAD_RATE_LIMIT_WINDOW_MS,
    limit: LEAD_RATE_LIMIT,
    message: formRateLimitMessage,
    skip: isBotSubmission,
    ...sharedFormRateLimitOptions,
    ...leadRateLimitOptions,
  });

  // CORS-allowlist. В проде фронт и API на одном домене — CORS не нужен;
  // если ALLOWED_ORIGINS не задан, отдаём заголовки только для same-origin
  // (cors() c origin=false по сути выключает CORS). В dev указывайте
  // ALLOWED_ORIGINS=http://localhost:5173 или совпадающий VITE_SITE_URL.
  const allowedOrigins = String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  app.use(accessLog());
  app.use((req, res, next) => {
    app.locals.activeRequests += 1;
    let finished = false;
    const markFinished = () => {
      if (finished) return;
      finished = true;
      app.locals.activeRequests = Math.max(0, app.locals.activeRequests - 1);
    };
    res.on('finish', markFinished);
    res.on('close', markFinished);
    next();
  });
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
  app.use((req, res, next) => {
    res.setHeader('Permissions-Policy', API_PERMISSIONS_POLICY);
    next();
  });
  app.use('/api/products', compression());
  app.use(express.json({ limit: MAX_QUOTE_PAYLOAD_BYTES }));
  app.use((err, req, res, next) => {
    if (err && err.type === 'entity.too.large') {
      return res
        .status(413)
        .json({ ok: false, message: messages.errors.api.payloadTooLarge });
    }
    return next(err);
  });

  // Публичная liveness-проба для Nginx/Docker/k8s. Никакого I/O и никаких
  // runtime-деталей: этот endpoint проксируется наружу через /api/*.
  app.get('/api/health', (req, res) => {
    res.json({
      ok: true,
    });
  });

  app.get('/api/runtime', (req, res) => {
    if (!hasInternalMetricsAccess(req)) {
      return res.status(404).json({
        ok: false,
        message: 'Не найдено',
      });
    }

    return res.json({
      ok: true,
      uptime: process.uptime(),
      ts: Date.now(),
      runtime: getRuntimeHealthSnapshot({
        activeRequests: app.locals.activeRequests,
      }),
    });
  });

  app.get('/api/forms/health', (req, res) => {
    const diagnostic = app.locals.formsDiagnostic;
    const ok = diagnostic.formsEnabled && diagnostic.smtpReady;

    return res.status(ok ? 200 : 503).json({
      ok,
      formsEnabled: diagnostic.formsEnabled,
      smtpConfigured: diagnostic.smtpConfigured,
      smtpVerified: diagnostic.smtpVerified,
      smtpReady: diagnostic.smtpReady,
      missingConfig: diagnostic.missing,
    });
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
      const filteredItems = applyCatalogFiltersAndSort(
        searchedItems,
        req.query
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
      return createErrorResponse(res, messages.errors.api.catalogLoadFailed);
    }
  });

  app.get('/api/products/featured', async (req, res) => {
    try {
      applyCatalogCache(res);

      const limit = parseLimit(
        req.query.limit,
        DEFAULT_FEATURED_PRODUCTS_LIMIT,
        MAX_FEATURED_PRODUCTS_LIMIT
      );

      return res.json({
        ok: true,
        items: await getFeaturedProductsResponse(limit),
      });
    } catch (error) {
      logger.error('catalog.featured.failed', { err: error });
      return createErrorResponse(res, messages.errors.api.productsLoadFailed);
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
      return createErrorResponse(
        res,
        messages.errors.api.suggestionsLoadFailed
      );
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
          message: messages.errors.api.productNotFound,
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
      return createErrorResponse(
        res,
        messages.errors.api.relatedProductsLoadFailed
      );
    }
  });

  app.get('/api/products/:slug', async (req, res) => {
    try {
      applyCatalogCache(res);

      const item = await catalogStore.findProductBySlug(req.params.slug);

      if (!item) {
        return res.status(404).json({
          ok: false,
          message: messages.errors.api.productNotFound,
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
      return createErrorResponse(res, messages.errors.api.productLoadFailed);
    }
  });

  // Сверка корзины/избранного с актуальным каталогом. Клиент шлёт массив
  // стабильных id, в ответ — список найденных позиций (актуальные slug,
  // price, unit, stock, name) и список отсутствующих. Сверка по id, а не
  // по slug, чтобы переименования не выглядели как удаление товара.
  app.post('/api/products/lookup', requireJsonContentType, async (req, res) => {
    try {
      const rawIds = Array.isArray(req.body?.ids) ? req.body.ids : null;
      if (!rawIds) {
        return createErrorResponse(
          res,
          messages.errors.api.idsArrayExpected,
          400
        );
      }
      if (rawIds.length > MAX_QUOTE_ITEMS) {
        return createErrorResponse(
          res,
          formatMessage(messages.errors.api.tooManyIds, {
            max: MAX_QUOTE_ITEMS,
          }),
          400
        );
      }
      const requestedIds = [];
      const seen = new Set();
      for (const value of rawIds) {
        const id = Number(value);
        if (!Number.isFinite(id) || id <= 0 || seen.has(id)) continue;
        seen.add(id);
        requestedIds.push(id);
      }

      const items = await catalogStore.loadCatalogProducts();
      const listItems = catalogStore.getCatalogProductListItems(items);
      const byId = new Map(listItems.map((item) => [item.id, item]));

      const found = [];
      const missing = [];
      for (const id of requestedIds) {
        const item = byId.get(id);
        if (item) found.push(item);
        else missing.push(id);
      }

      return res.json({ ok: true, found, missing });
    } catch (error) {
      logger.error('catalog.lookup.failed', { err: error });
      return createErrorResponse(res, messages.errors.api.lookupFailed);
    }
  });

  app.post(
    '/api/quote',
    requireJsonContentType,
    botFormRateLimiter,
    quoteRateLimiter,
    async (req, res) => {
      const formResponseStartedAt = Date.now();
      const formResponseDelayMs = pickFormResponseDelayMs(
        normalizedFormResponseDelayRange
      );

      try {
        const formsDiagnostic = app.locals.formsDiagnostic;
        if (!formsDiagnostic.formsEnabled || !formsDiagnostic.smtpReady) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            getFormsUnavailableMessage(formsDiagnostic),
            503
          );
        }

        if (getBotSubmissionSignal(req)) {
          return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
            ok: true,
            message: messages.success.quoteSent,
          });
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
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            messages.errors.api.invalidQuoteRequest,
            400
          );
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
          resolvedMailTransporter,
          {
            from: env.SMTP_FROM,
            to: env.QUOTE_TO_EMAIL,
            ...(replyTo ? { replyTo } : {}),
            subject: 'Новая заявка на КП — ЮжУралЭлектроКабель',
            html,
          },
          { ...mailSendOptions, event: 'quote.send' }
        );

        return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
          ok: true,
          message: messages.success.quoteSent,
        });
      } catch (error) {
        logger.error('quote.send.failed', { err: error });
        return sendFormErrorResponse(
          res,
          formResponseStartedAt,
          formResponseDelayMs,
          messages.errors.api.quoteSendFailed
        );
      }
    }
  );

  app.post(
    '/api/lead-request',
    requireJsonContentType,
    botFormRateLimiter,
    leadRateLimiter,
    async (req, res) => {
      const formResponseStartedAt = Date.now();
      const formResponseDelayMs = pickFormResponseDelayMs(
        normalizedFormResponseDelayRange
      );

      try {
        const formsDiagnostic = app.locals.formsDiagnostic;
        if (!formsDiagnostic.formsEnabled || !formsDiagnostic.smtpReady) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            getFormsUnavailableMessage(formsDiagnostic),
            503
          );
        }

        if (getBotSubmissionSignal(req)) {
          return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
            ok: true,
            message: messages.success.leadSentDetailed,
          });
        }

        const { name, phone, comment, source, createdAt } = req.body;
        const contactName = String(name || '').trim();
        const normalizedPhone = normalizePhoneInput(phone);
        const leadComment = String(comment || '').trim();
        const leadSource = String(source || '').trim();

        if (!isValidRussianPhone(normalizedPhone)) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            messages.errors.api.phoneInvalid,
            400
          );
        }

        if (
          !isTrimmedStringWithinLength(contactName, MAX_LEAD_NAME_LENGTH) ||
          !isTrimmedStringWithinLength(leadComment, MAX_LEAD_COMMENT_LENGTH) ||
          !isTrimmedStringWithinLength(leadSource, MAX_LEAD_SOURCE_LENGTH)
        ) {
          return sendFormErrorResponse(
            res,
            formResponseStartedAt,
            formResponseDelayMs,
            messages.errors.api.invalidQuoteRequest,
            400
          );
        }

        const html = `
        <h2>Новая короткая заявка</h2>
        <p><strong>Дата:</strong> ${escapeHtml(createdAt) || '—'}</p>
        <p><strong>Источник:</strong> ${escapeHtml(leadSource) || '—'}</p>
        <p><strong>Контактное лицо:</strong> ${escapeHtml(contactName) || 'Не указано'}</p>
        <p><strong>Телефон:</strong> ${escapeHtml(normalizedPhone)}</p>
        <p><strong>Комментарий:</strong> ${escapeHtml(leadComment) || '—'}</p>
      `;

        await sendMailWithRetry(
          resolvedMailTransporter,
          {
            from: env.SMTP_FROM,
            to: env.QUOTE_TO_EMAIL,
            subject: 'Новая короткая заявка — ЮжУралЭлектроКабель',
            html,
          },
          { ...mailSendOptions, event: 'lead.send' }
        );

        return sendFormJson(res, formResponseStartedAt, formResponseDelayMs, {
          ok: true,
          message: messages.success.leadSentDetailed,
        });
      } catch (error) {
        logger.error('lead.send.failed', { err: error });
        return sendFormErrorResponse(
          res,
          formResponseStartedAt,
          formResponseDelayMs,
          messages.errors.api.quoteSendFailed
        );
      }
    }
  );

  return app;
}

// Запускаем listen только если файл вызван напрямую (`node server.js`),
// а не импортирован тестом или другим скриптом.
const isMain =
  process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

// Проверка обязательных env-переменных на старте.
function logFormsStartupState(formsDiagnostic) {
  const diagnostic = formsDiagnostic || withFormsSmtpStatus(validateFormsEnv());
  if (diagnostic.formsEnabled && diagnostic.missing.length > 0) {
    logger.warn('startup.smtp_misconfigured', {
      missing: diagnostic.missing,
      hint: 'в production процесс завершится; локально формы вернут 503',
    });
  } else if (diagnostic.formsEnabled && diagnostic.smtpVerified === false) {
    logger.error('startup.smtp_unverified', {
      hint: 'SMTP verify не прошёл: проверьте .env или задайте FORMS_ENABLED=false',
    });
  } else if (diagnostic.formsEnabled && diagnostic.smtpVerified === true) {
    logger.info('startup.smtp_verified', {
      hint: 'FORMS_ENABLED=true: SMTP настроен, transporter.verify() успешен',
    });
  } else if (!diagnostic.formsEnabled) {
    logger.warn('startup.forms_disabled', {
      hint: 'FORMS_ENABLED=false: заявки /api/quote и /api/lead-request отключены',
    });
  }
}

export async function startServer({
  env = process.env,
  port = env.PORT || PORT,
  warmCatalogOnStart = true,
  mailTransporter,
  listen = (app, listenPort, onListening) =>
    app.listen(listenPort, onListening),
} = {}) {
  const startup = validateStartupEnv(env);
  const formsStartup = await initializeFormsForStartup({
    env,
    mailTransporter,
  });
  logFormsStartupState(formsStartup.diagnostic || startup.forms);

  const app = createApp({
    env,
    warmCatalogOnStart,
    mailTransporter: formsStartup.transporter,
    formsDiagnostic: formsStartup.diagnostic,
  });
  const server = listen(app, port, () => {
    logger.info('startup.listening', { port });
  });

  return { app, server };
}

if (isMain) {
  try {
    await startServer();
  } catch (error) {
    logger.error('startup.env_invalid', { err: error });
    process.exit(1);
  }
}
