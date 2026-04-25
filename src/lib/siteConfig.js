// Единый источник правды о компании. Используется и на сайте (JSON-LD,
// мета-теги), и в скриптах (sitemap.xml, robots.txt, серверные ответы).
//
// Базовый URL читается из VITE_SITE_URL (или SITE_URL для серверных скриптов),
// чтобы dev-сборка не лезла в продовый домен.

function readSiteUrl() {
  if (typeof process !== 'undefined' && process.env) {
    const fromNode = process.env.SITE_URL || process.env.VITE_SITE_URL;
    if (fromNode) return fromNode;
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    const fromVite = import.meta.env.VITE_SITE_URL;
    if (fromVite) return fromVite;
  }
  return 'https://yuzhuralelectrokabel.ru';
}

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

export const SITE_URL = trimTrailingSlash(readSiteUrl());
export const SITE_NAME = 'ЮжУралЭлектроКабель';
export const SITE_LEGAL_NAME = 'ООО «ЮжУралЭлектроКабель»';
export const SITE_DESCRIPTION =
  'Оптовая поставка кабельно-проводниковой продукции в Челябинске и по России. Склад, отгрузка от 1 дня, работа с юрлицами по НДС.';
export const SITE_LOGO_PATH = '/logo.png';

export const SITE_PHONE = '+78005553552';
export const SITE_PHONE_DISPLAY = '8 800 555 35 52';
export const SITE_EMAIL = 'sale@site.ru';

export const SITE_ADDRESS = {
  streetAddress: 'ул. Южная, 9А',
  addressLocality: 'Челябинск',
  addressRegion: 'Челябинская область',
  postalCode: '454000',
  addressCountry: 'RU',
};

// Часы работы — формат schema.org openingHours: «Пн–Пт 09:00–18:00».
export const SITE_OPENING_HOURS = ['Mo-Fr 09:00-18:00'];

export const SITE_SOCIAL_LINKS = [];

export function absoluteUrl(path = '/') {
  if (!path) return SITE_URL;
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${normalized}`;
}
