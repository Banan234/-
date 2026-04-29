import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';

// Минимальный структурированный логгер. Пишет одну JSON-строку на событие
// в stdout (для info/debug) и stderr (для warn/error) — формат ровно тот,
// что переваривают логосборщики (Loki, ELK, Datadog) без preprocessing.
// Без внешних зависимостей; если когда-то захотите pino — sigнатура
// logger.info(msg, meta) совместима, swap займёт одну правку импорта.
//
// Управление через env:
//   LOG_LEVEL  = debug | info | warn | error  (default: info)
//   ACCESS_LOG_SUCCESS_SAMPLE_RATE = 0..1, доля 2xx/3xx access-log
//   ACCESS_LOG_SLOW_MS = N, всегда логировать успешные запросы медленнее N ms
//   NODE_ENV   = test  → логгер молчит (тесты не засоряются)
//   VITEST     = 'true' → то же самое (vitest выставляет автоматически)

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const REDACTED = '[redacted]';
const MAX_SANITIZE_DEPTH = 6;
const MAX_ARRAY_ITEMS = 50;
const DEFAULT_ACCESS_LOG_SLOW_MS = 1_000;
const DEFAULT_PRODUCTION_ACCESS_LOG_SUCCESS_SAMPLE_RATE = 0.1;
const REQUEST_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const EMAIL_RE =
  /\b[A-Z0-9._%+-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)*\.[A-Z]{2,24}\b/gi;
const PHONE_RE =
  /(?<![\dA-Za-z])(?:\+?7|8)?[\s(-]*[3-9]\d{2}[\s).(-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2}(?!\d)/g;
const SENSITIVE_QUERY_PARAM_RE =
  /(^|[?&;])([^=&#;\s]*(?:email|e-?mail|phone|tel|telephone|mobile)[^=&#;\s]*=)([^&#;\s]*)/gi;
const SENSITIVE_KEYS = new Set([
  'authorization',
  'cookie',
  'dsn',
  'email',
  'mail',
  'mobile',
  'mobilenumber',
  'pass',
  'password',
  'phone',
  'phonenumber',
  'replyto',
  'secret',
  'smtppass',
  'smtpuser',
  'tel',
  'telegram',
  'telephone',
  'token',
  'whatsapp',
]);
const requestContext = new AsyncLocalStorage();

function resolveLevel() {
  const env = String(process.env.LOG_LEVEL || '').toLowerCase();
  return LEVELS[env] ?? LEVELS.info;
}

function parseNumberEnv(
  value,
  fallback,
  { min = -Infinity, max = Infinity } = {}
) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function getAccessLogSuccessSampleRate() {
  if (process.env.ACCESS_LOG_SUCCESS_SAMPLE_RATE != null) {
    return parseNumberEnv(process.env.ACCESS_LOG_SUCCESS_SAMPLE_RATE, 1, {
      min: 0,
      max: 1,
    });
  }

  return process.env.NODE_ENV === 'production'
    ? DEFAULT_PRODUCTION_ACCESS_LOG_SUCCESS_SAMPLE_RATE
    : 1;
}

function getAccessLogSlowMs() {
  return parseNumberEnv(
    process.env.ACCESS_LOG_SLOW_MS,
    DEFAULT_ACCESS_LOG_SLOW_MS,
    {
      min: 0,
    }
  );
}

function isSilenced() {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function normalizeRequestId(value) {
  const requestId = String(value || '').trim();
  return REQUEST_ID_RE.test(requestId) ? requestId : '';
}

export function createRequestId() {
  return randomUUID();
}

export function getCurrentRequestId() {
  return requestContext.getStore()?.request_id || '';
}

export function redactLogString(value) {
  return String(value)
    .replace(SENSITIVE_QUERY_PARAM_RE, `$1$2${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, REDACTED);
}

export function sanitizeRequestPath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '/';

  try {
    const url = new URL(raw, 'http://localhost');
    return redactLogString(url.pathname || '/');
  } catch {
    const [path = '/'] = raw.split(/[?#]/);
    return redactLogString(path || '/');
  }
}

export function serializeError(error) {
  if (!(error instanceof Error)) {
    return sanitizeLogValue(error);
  }

  const record = {
    name: redactLogString(error.name),
    message: redactLogString(error.message),
    code: error.code ? redactLogString(error.code) : undefined,
    responseCode: error.responseCode,
    command: error.command ? redactLogString(error.command) : undefined,
    stack: error.stack ? redactLogString(error.stack) : undefined,
  };

  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  );
}

function isSensitiveLogKey(key) {
  const normalized = String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-я]/g, '');
  return (
    SENSITIVE_KEYS.has(normalized) ||
    normalized.endsWith('email') ||
    normalized.endsWith('phone') ||
    normalized.endsWith('telephone') ||
    normalized.includes('password') ||
    normalized.includes('token') ||
    normalized.includes('secret') ||
    normalized.includes('cookie')
  );
}

export function sanitizeLogValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string') return redactLogString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value.toISOString();
  if (depth >= MAX_SANITIZE_DEPTH) return '[truncated]';

  if (typeof value !== 'object') {
    return redactLogString(String(value));
  }

  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => sanitizeLogValue(item, depth + 1, seen));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const safeKey = redactLogString(key);
    result[safeKey] = isSensitiveLogKey(key)
      ? REDACTED
      : sanitizeLogValue(item, depth + 1, seen);
  }
  return result;
}

export function sanitizeLogMeta(meta) {
  if (!meta || typeof meta !== 'object') return {};
  return sanitizeLogValue(meta);
}

function emit(level, msg, meta) {
  if (isSilenced()) return;
  if (LEVELS[level] < resolveLevel()) return;

  const safeMeta = sanitizeLogMeta(meta);
  const currentRequestId = getCurrentRequestId();
  const record = {
    ts: new Date().toISOString(),
    level,
    msg: redactLogString(msg),
    ...safeMeta,
    ...(currentRequestId ? { request_id: currentRequestId } : {}),
  };

  // err → разворачиваем стек/название/код в плоские поля с redaction.
  if (meta?.err instanceof Error) {
    record.err = serializeError(meta.err);
  }

  const line = JSON.stringify(record);
  if (level === 'warn' || level === 'error') {
    process.stderr.write(line + '\n');
  } else {
    process.stdout.write(line + '\n');
  }
}

export const logger = {
  debug: (msg, meta) => emit('debug', msg, meta),
  info: (msg, meta) => emit('info', msg, meta),
  warn: (msg, meta) => emit('warn', msg, meta),
  error: (msg, meta) => emit('error', msg, meta),
};

function shouldWriteAccessLog({ statusCode, durationMs }) {
  if (statusCode >= 400) return true;
  if (durationMs >= getAccessLogSlowMs()) return true;

  const sampleRate = getAccessLogSuccessSampleRate();
  if (sampleRate <= 0) return false;
  if (sampleRate >= 1) return true;
  return Math.random() < sampleRate;
}

// Express-middleware: пишет одну строку на запрос с методом, путём, статусом
// и длительностью. Подключается через app.use() — обычно одним из первых.
export function accessLog() {
  return (req, res, next) => {
    const startedAt = process.hrtime.bigint();
    const requestId =
      normalizeRequestId(req.get?.('x-request-id')) || createRequestId();

    req.id = requestId;
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    return requestContext.run({ request_id: requestId }, () => {
      res.on('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startedAt) / 1e6;
        if (
          !shouldWriteAccessLog({
            statusCode: res.statusCode,
            durationMs,
          })
        ) {
          return;
        }

        const level =
          res.statusCode >= 500
            ? 'error'
            : res.statusCode >= 400
              ? 'warn'
              : 'info';
        emit(level, 'http', {
          request_id: requestId,
          method: req.method,
          path: sanitizeRequestPath(req.originalUrl || req.url),
          status: res.statusCode,
          duration_ms: Math.round(durationMs * 10) / 10,
          ip: req.ip,
        });
      });
      next();
    });
  };
}
