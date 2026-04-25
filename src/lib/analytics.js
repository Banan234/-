// Тонкая обёртка над Яндекс.Метрикой. Если переменная VITE_YANDEX_METRIKA_ID
// не задана — все вызовы превращаются в no-op и ничего не подгружается.
//
// Используем Метрику как простую event-шину для целей B2B-аналитики:
// quote-open, quote-submit, price-download, product-view, search-submit и т.п.
//
// Если в будущем добавится Google Analytics или собственный backend,
// достаточно расширить trackEvent / trackPageview здесь.

const COUNTER_ID = import.meta.env.VITE_YANDEX_METRIKA_ID;
let isInitialized = false;
let isReady = false;

function isClient() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function counterIdNumber() {
  const num = Number(COUNTER_ID);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export function initAnalytics() {
  if (isInitialized || !isClient()) return;
  const id = counterIdNumber();
  if (!id) return;
  isInitialized = true;

  // Стандартный snippet от Яндекса, переписанный читаемо.
  /* eslint-disable */
  (function (m, e, t, r, i, k, a) {
    m[i] =
      m[i] ||
      function () {
        (m[i].a = m[i].a || []).push(arguments);
      };
    m[i].l = 1 * new Date();
    for (let j = 0; j < e.scripts.length; j++) {
      if (e.scripts[j].src === r) return;
    }
    k = e.createElement(t);
    a = e.getElementsByTagName(t)[0];
    k.async = 1;
    k.src = r;
    a.parentNode.insertBefore(k, a);
  })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
  /* eslint-enable */

  window.ym(id, 'init', {
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: false,
  });

  isReady = true;
}

export function trackEvent(name, params) {
  if (!isClient() || !isReady || !window.ym) return;
  const id = counterIdNumber();
  if (!id || !name) return;
  try {
    if (params) {
      window.ym(id, 'reachGoal', name, params);
    } else {
      window.ym(id, 'reachGoal', name);
    }
  } catch (error) {
    // Метрика никогда не должна валить приложение.
    console.warn('analytics: trackEvent failed', error);
  }
}

export function trackPageview(url) {
  if (!isClient() || !isReady || !window.ym) return;
  const id = counterIdNumber();
  if (!id) return;
  const target = url || window.location.pathname + window.location.search;
  try {
    window.ym(id, 'hit', target);
  } catch (error) {
    console.warn('analytics: trackPageview failed', error);
  }
}

export function isAnalyticsEnabled() {
  return Boolean(counterIdNumber());
}
