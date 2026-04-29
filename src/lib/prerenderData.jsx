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
  return window.__YUZHURAL_PRERENDER_DATA__ || {};
}
