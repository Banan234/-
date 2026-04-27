import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import {
  SITE_DESCRIPTION,
  SITE_LOGO_PATH,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from '../lib/siteConfig';
import { normalizeMetaDescription } from '../lib/metaDescription';

const DEFAULT_OG_IMAGE = absoluteUrl(SITE_LOGO_PATH);

function upsertMeta(attr, key, value) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (value == null || value === '') {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', value);
}

function upsertLink(rel, href) {
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!href) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

// Хук обновляет <title>, description, canonical, OpenGraph и Twitter Card.
// Все вызовы идут через мутацию <head> — server-side рендера у нас нет,
// но для шаринга в Telegram/WhatsApp/VK достаточно того, что превью
// генерируется ботом этих площадок по уже отрендеренному DOM.
export function useSEO({
  title,
  description = SITE_DESCRIPTION,
  ogType = 'website',
  image = DEFAULT_OG_IMAGE,
  canonical,
} = {}) {
  // useLocation подписан на роутер, чтобы canonical обновлялся при SPA-переходе
  // даже если сама страница не передала canonical явно.
  const location = useLocation();
  const fullTitle = title ? `${title} — ${SITE_NAME}` : SITE_NAME;
  const metaDescription = normalizeMetaDescription(description);
  const ogImage = image ? absoluteUrl(image) : DEFAULT_OG_IMAGE;
  const canonicalUrl = canonical
    ? absoluteUrl(canonical)
    : `${SITE_URL}${location.pathname}`;

  useEffect(() => {
    document.title = fullTitle;

    upsertMeta('name', 'description', metaDescription);

    upsertMeta('property', 'og:site_name', SITE_NAME);
    upsertMeta('property', 'og:locale', 'ru_RU');
    upsertMeta('property', 'og:type', ogType);
    upsertMeta('property', 'og:title', fullTitle);
    upsertMeta('property', 'og:description', metaDescription);
    upsertMeta('property', 'og:url', canonicalUrl);
    upsertMeta('property', 'og:image', ogImage);
    upsertMeta('property', 'og:image:alt', fullTitle);

    upsertMeta('name', 'twitter:card', 'summary_large_image');
    upsertMeta('name', 'twitter:title', fullTitle);
    upsertMeta('name', 'twitter:description', metaDescription);
    upsertMeta('name', 'twitter:image', ogImage);

    upsertLink('canonical', canonicalUrl);
  }, [fullTitle, metaDescription, ogType, ogImage, canonicalUrl]);
}
