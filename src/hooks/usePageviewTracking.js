import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { trackPageview } from '../lib/analytics';

// Шлёт виртуальный pageview в Метрику при каждом переходе по SPA-роутингу.
// Вызывается один раз — например, в MainLayout.
export function usePageviewTracking() {
  const location = useLocation();
  const previousUrlRef = useRef(null);

  useEffect(() => {
    const url = location.pathname + location.search;
    if (previousUrlRef.current === url) return;
    previousUrlRef.current = url;
    trackPageview(url);
  }, [location.pathname, location.search]);
}
