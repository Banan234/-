import { describe, expect, it } from 'vitest';
import { buildRobotsTxt, buildSitemapXml } from './siteSeo.js';

const SITE = 'https://example.test';

describe('buildSitemapXml', () => {
  it('содержит все статические маршруты и обёрнут <urlset>', () => {
    const xml = buildSitemapXml({ siteUrl: SITE, lastmod: '2026-01-01' });

    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    expect(xml).toContain(`<loc>${SITE}/catalog</loc>`);
    expect(xml).toContain(`<loc>${SITE}/contacts</loc>`);
    expect(xml).toContain('<lastmod>2026-01-01</lastmod>');
  });

  it('добавляет категории и карточки товаров, дедуплицирует по slug', () => {
    const xml = buildSitemapXml({
      siteUrl: SITE,
      products: [
        { slug: 'vvg-3h2-5' },
        { slug: 'vvg-3h2-5' }, // дубль — должен схлопнуться
        { slug: 'sip-4-16' },
        { slug: '' }, // пропускаем
      ],
      categoriesData: {
        sections: [
          {
            slug: 'kabel-i-provod',
            categories: [{ slug: 'silovoy-kabel' }],
          },
        ],
      },
      lastmod: '2026-01-01',
    });

    expect(xml).toContain(`<loc>${SITE}/catalog/kabel-i-provod</loc>`);
    expect(xml).toContain(`<loc>${SITE}/catalog/silovoy-kabel</loc>`);
    expect(xml).toContain(`<loc>${SITE}/product/vvg-3h2-5</loc>`);
    expect(xml).toContain(`<loc>${SITE}/product/sip-4-16</loc>`);
    // ровно один <loc> на дубль
    const matches = xml.match(/\/product\/vvg-3h2-5</g) || [];
    expect(matches.length).toBe(1);
  });

  it('экранирует XML-спецсимволы в slug', () => {
    const xml = buildSitemapXml({
      siteUrl: SITE,
      products: [{ slug: 'a&b' }],
    });
    expect(xml).toContain('/product/a&amp;b');
    expect(xml).not.toContain('/product/a&b<');
  });

  it('убирает завершающий слэш у siteUrl', () => {
    const xml = buildSitemapXml({ siteUrl: `${SITE}//` });
    expect(xml).toContain(`<loc>${SITE}/</loc>`);
    expect(xml).not.toContain(`${SITE}///`);
  });
});

describe('buildRobotsTxt', () => {
  it('разрешает всё, прячет служебные пути и указывает sitemap', () => {
    const txt = buildRobotsTxt({ siteUrl: SITE });

    expect(txt).toContain('User-agent: *');
    expect(txt).toContain('Allow: /');
    expect(txt).toContain('Disallow: /api/');
    expect(txt).toContain('Disallow: /cart');
    expect(txt).toContain('Disallow: /favorites');
    expect(txt).toContain(`Sitemap: ${SITE}/sitemap.xml`);
  });
});
