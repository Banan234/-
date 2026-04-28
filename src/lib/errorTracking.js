// Тонкая обёртка над @sentry/react с тем же контрактом, что и analytics.js:
// без VITE_SENTRY_DSN всё превращается в no-op и SDK даже не загружается
// (lazy import → отдельный vite-чанк, который не запрашивается без DSN).
//
// Совместимо с GlitchTip (его DSN — тот же формат, эндпоинт API тот же).
// На фронте captureException — единственная точка входа: console.error
// в критичных местах (QuoteForm, HeroLeadForm и т.п.) обёрнут в неё.

const DSN = import.meta.env.VITE_SENTRY_DSN;
const ENVIRONMENT =
  import.meta.env.VITE_SENTRY_ENVIRONMENT || import.meta.env.MODE;
const RELEASE = import.meta.env.VITE_SENTRY_RELEASE || undefined;
const SAMPLE_RATE = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE) || 0;
const REDACTED = '[redacted]';
const MAX_SANITIZE_DEPTH = 8;
const MAX_SANITIZE_ARRAY_ITEMS = 100;
const EMAIL_RE =
  /\b[A-Z0-9._%+-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)*\.[A-Z]{2,24}\b/gi;
const PHONE_RE =
  /(^|[^\dA-Za-z])((?:\+?7|8)?[\s(.-]*[3-9]\d{2}[\s).(-]*\d{3}[\s.-]*\d{2}[\s.-]*\d{2})(?!\d)/g;
const SENSITIVE_QUERY_PARAM_RE =
  /([?&;])([^=&#;\s]*(?:email|e-?mail|phone|tel|telephone|mobile|whatsapp|telegram)[^=&#;\s]*=)([^&#;\s]*)/gi;
const SENSITIVE_KEYS = new Set([
  'authorization',
  'contactemail',
  'contactphone',
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
  'secret',
  'tel',
  'telegram',
  'telephone',
  'token',
  'whatsapp',
]);

let sentryModule = null;
let initPromise = null;

function isClient() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function isErrorTrackingEnabled() {
  return Boolean(DSN);
}

function normalizeSensitiveKey(key) {
  return String(key || '')
    .toLowerCase()
    .replace(/[^a-z0-9а-я]/g, '');
}

function isSensitiveSentryKey(key) {
  const normalized = normalizeSensitiveKey(key);
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

export function redactSentryString(value) {
  return String(value)
    .replace(SENSITIVE_QUERY_PARAM_RE, `$1$2${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(PHONE_RE, `$1${REDACTED}`);
}

function stripQueryFromUrl(value) {
  const raw = String(value || '');
  const baseOrigin =
    typeof window !== 'undefined'
      ? window.location?.origin || 'http://localhost'
      : 'http://localhost';
  try {
    const url = new URL(raw, baseOrigin);
    const base = `${url.origin}${url.pathname}`;
    return redactSentryString(base);
  } catch {
    const [path = ''] = raw.split(/[?#]/);
    return redactSentryString(path);
  }
}

export function sanitizeSentryValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null) return value;
  if (typeof value === 'string') return redactSentryString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (value instanceof Error) {
    return {
      name: redactSentryString(value.name),
      message: redactSentryString(value.message),
      stack: value.stack ? redactSentryString(value.stack) : undefined,
    };
  }
  if (depth >= MAX_SANITIZE_DEPTH) return '[truncated]';
  if (typeof value !== 'object') return redactSentryString(String(value));

  if (seen.has(value)) return '[circular]';
  seen.add(value);

  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_SANITIZE_ARRAY_ITEMS)
      .map((item) => sanitizeSentryValue(item, depth + 1, seen));
  }

  const result = {};
  for (const [key, item] of Object.entries(value)) {
    const safeKey = redactSentryString(key);
    result[safeKey] = isSensitiveSentryKey(key)
      ? REDACTED
      : sanitizeSentryValue(item, depth + 1, seen);
  }
  return result;
}

export function sanitizeSentryEvent(event) {
  if (!event || typeof event !== 'object') return event;

  const sanitized = sanitizeSentryValue(event);
  if (sanitized.request?.url) {
    sanitized.request.url = stripQueryFromUrl(sanitized.request.url);
  }
  return sanitized;
}

function buildCaptureOptions(context) {
  return context ? { extra: sanitizeSentryValue(context) } : undefined;
}

// Инициализация. Идемпотентна: повторный вызов отдаёт тот же promise,
// чтобы initErrorTracking() было безопасно дёргать из main.jsx и из тестов.
export function initErrorTracking() {
  if (!isClient() || !DSN) return Promise.resolve(null);
  if (initPromise) return initPromise;

  initPromise = import('@sentry/react')
    .then((Sentry) => {
      Sentry.init({
        dsn: DSN,
        environment: ENVIRONMENT,
        release: RELEASE,
        // Performance/replay по умолчанию выключены — это B2B-сайт,
        // объёмы трафика низкие, лимиты бесплатного GlitchTip ограничены.
        // Нужны трейсы — поднимите VITE_SENTRY_TRACES_SAMPLE_RATE.
        tracesSampleRate: SAMPLE_RATE,
        // Не шлём PII — клиенты заполняют форму с реальным телефоном/email.
        sendDefaultPii: false,
        ignoreErrors: [
          // Браузерные расширения (Yandex/Chrome/Safari) часто кидают этот шум.
          'ResizeObserver loop limit exceeded',
          'ResizeObserver loop completed with undelivered notifications',
          // Сетевые ошибки от блокировщиков рекламы — не наши.
          /Failed to fetch.*mc\.yandex\.ru/,
        ],
        beforeSend: sanitizeSentryEvent,
      });
      sentryModule = Sentry;
      return Sentry;
    })
    .catch((error) => {
      // Сам трекер не должен валить приложение, даже если CDN/чанк недоступен.
      console.warn('errorTracking: SDK load failed', error);
      return null;
    });

  return initPromise;
}

// Захват ошибки. Если Sentry ещё не загрузился — буферизуем до готовности,
// иначе ошибки на этапе bootstrap теряются. Если DSN не задан — console.error,
// сохраняя dev-удобство.
const pendingCaptures = [];

function flushPending() {
  if (!sentryModule) return;
  while (pendingCaptures.length > 0) {
    const { error, context } = pendingCaptures.shift();
    sentryModule.captureException(error, buildCaptureOptions(context));
  }
}

export function captureException(error, context) {
  if (!error) return;

  if (sentryModule) {
    sentryModule.captureException(error, buildCaptureOptions(context));
    return;
  }

  if (DSN && initPromise) {
    pendingCaptures.push({ error, context });
    initPromise.then(flushPending);
    return;
  }

  // No-op fallback с понятным выводом в dev-консоли.
  if (context) {
    console.error(error, sanitizeSentryValue(context));
  } else {
    console.error(error);
  }
}

export function captureMessage(message, level = 'info') {
  if (!message) return;
  if (sentryModule) {
    sentryModule.captureMessage(message, level);
    return;
  }
  if (level === 'error' || level === 'fatal') {
    console.error(message);
  } else {
    console.warn(message);
  }
}

// Для <Sentry.ErrorBoundary> — динамический ре-экспорт. До init() компонент
// возвращает обычный <>{children}</>, после init — настоящий ErrorBoundary.
export async function getErrorBoundary() {
  if (!DSN) return null;
  const Sentry = await initErrorTracking();
  return Sentry?.ErrorBoundary || null;
}
