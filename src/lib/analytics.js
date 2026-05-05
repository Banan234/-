// Тонкая обёртка над Яндекс.Метрикой. Если переменная VITE_YANDEX_METRIKA_ID
// не задана — все вызовы превращаются в no-op и ничего не подгружается.
//
// Используем Метрику как простую event-шину для целей B2B-аналитики:
// quote-open, quote-submit, price-download, product-view, search-submit и т.п.
//
// Если в будущем добавится Google Analytics или собственный backend,
// достаточно расширить trackEvent / trackPageview здесь.

const COUNTER_ID = import.meta.env.VITE_YANDEX_METRIKA_ID;
const MAX_PENDING_HITS = 50;
let isReady = false;
let initPromise = null;
const pendingHits = [];

function isClient() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function counterIdNumber() {
  const num = Number(COUNTER_ID);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function deferAfterBootstrap(callback) {
  const scheduleIdle =
    window.requestIdleCallback ||
    ((idleCallback) => window.setTimeout(idleCallback, 1200));
  const schedule = () => scheduleIdle(callback, { timeout: 3000 });

  if (document.readyState === 'complete') {
    window.setTimeout(schedule, 0);
    return;
  }

  window.addEventListener('load', schedule, { once: true });
}

function sendEvent(id, name, params) {
  if (!window.ym || !name) return;
  if (params) {
    window.ym(id, 'reachGoal', name, params);
  } else {
    window.ym(id, 'reachGoal', name);
  }
}

function sendPageview(id, url) {
  if (!window.ym) return;
  const target = url || window.location.pathname + window.location.search;
  window.ym(id, 'hit', target);
}

function flushPendingHits(id) {
  while (pendingHits.length > 0) {
    const hit = pendingHits.shift();
    try {
      if (hit.type === 'event') {
        sendEvent(id, hit.name, hit.params);
      } else {
        sendPageview(id, hit.url);
      }
    } catch (error) {
      console.warn('analytics: pending hit failed', error);
    }
  }
}

function enqueueHit(hit) {
  if (pendingHits.length >= MAX_PENDING_HITS) {
    pendingHits.shift();
  }
  pendingHits.push(hit);
  initAnalytics();
}

export function initAnalytics() {
  if (!isClient()) return Promise.resolve(false);
  if (isReady) return Promise.resolve(true);
  if (initPromise) return initPromise;
  const id = counterIdNumber();
  if (!id) return Promise.resolve(false);

  initPromise = new Promise((resolve) => {
    deferAfterBootstrap(() => {
      if (isReady) {
        resolve(true);
        return;
      }

      // Стандартный snippet от Яндекса, переписанный читаемо. Скрипт остаётся
      // async, а сама вставка откладывается до load/idle, чтобы не трогать LCP.
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
      })(
        window,
        document,
        'script',
        'https://mc.yandex.ru/metrika/tag.js',
        'ym'
      );
      /* eslint-enable */

      window.ym(id, 'init', {
        clickmap: false,
        trackLinks: true,
        accurateTrackBounce: false,
        webvisor: false,
      });

      isReady = true;
      flushPendingHits(id);
      resolve(true);
    });
  });

  return initPromise;
}

export function trackEvent(name, params) {
  if (!isClient()) return;
  const id = counterIdNumber();
  if (!id || !name) return;
  if (!isReady || !window.ym) {
    enqueueHit({ type: 'event', name, params });
    return;
  }
  try {
    sendEvent(id, name, params);
  } catch (error) {
    // Метрика никогда не должна валить приложение.
    console.warn('analytics: trackEvent failed', error);
  }
}

export function trackPageview(url) {
  if (!isClient()) return;
  const id = counterIdNumber();
  if (!id) return;
  if (!isReady || !window.ym) {
    enqueueHit({ type: 'pageview', url });
    return;
  }
  try {
    sendPageview(id, url);
  } catch (error) {
    console.warn('analytics: trackPageview failed', error);
  }
}

export function isAnalyticsEnabled() {
  return Boolean(counterIdNumber());
}
