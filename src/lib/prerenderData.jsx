// Файл передаёт build-time данные prerender между серверным entry и клиентской гидрацией.

import { createContext, useContext } from 'react';

const PrerenderDataContext = createContext({});

export function PrerenderDataProvider({ data = {}, children }) {
  return (
    <PrerenderDataContext.Provider value={data || {}}>
      {children}
    </PrerenderDataContext.Provider>
  );
}

export function usePrerenderData() {
  return useContext(PrerenderDataContext);
}

export function getBrowserPrerenderData() {
  if (typeof window === 'undefined') return {};
  if (typeof document === 'undefined') {
    return window.__YUZHURAL_PRERENDER_DATA__ || {};
  }
  const element = document.getElementById('yuzhural-prerender-data');
  if (!element?.textContent) return window.__YUZHURAL_PRERENDER_DATA__ || {};

  try {
    return JSON.parse(element.textContent) || {};
  } catch (error) {
    console.warn('prerenderData: parse failed', error);
    return {};
  }
}
