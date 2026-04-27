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

let sentryModule = null;
let initPromise = null;

function isClient() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function isErrorTrackingEnabled() {
  return Boolean(DSN);
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
        beforeSend(event) {
          // Отрезаем потенциальные query-параметры с чем-то чувствительным.
          if (event.request?.url) {
            try {
              const url = new URL(event.request.url);
              event.request.url = `${url.origin}${url.pathname}`;
            } catch {
              /* invalid URL — оставляем как есть */
            }
          }
          return event;
        },
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
    sentryModule.captureException(
      error,
      context ? { extra: context } : undefined
    );
  }
}

export function captureException(error, context) {
  if (!error) return;

  if (sentryModule) {
    sentryModule.captureException(
      error,
      context ? { extra: context } : undefined
    );
    return;
  }

  if (DSN && initPromise) {
    pendingCaptures.push({ error, context });
    initPromise.then(flushPending);
    return;
  }

  // No-op fallback с понятным выводом в dev-консоли.
  if (context) {
    console.error(error, context);
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
