import { useEffect } from 'react';

const SITE_NAME = 'ЮжУралЭлектроКабель';

function setMeta(attr, key, value) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

export function useSEO({ title, description = '', ogType = 'website' }) {
  useEffect(() => {
    const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
    document.title = fullTitle;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', fullTitle);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:type', ogType);
  }, [title, description, ogType]);
}
